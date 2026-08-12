import { Chess } from "chess.js";
import type { Square } from "chess.js";
import type {
  ColorChoice,
  GameOverReason,
  GameResult,
  PlayerColor,
  PromotionPiece,
  ServerMessage,
  TimeControlId,
} from "../../features/chess/protocol.ts";
import { timeControlMs } from "../../features/chess/protocol.ts";
import type { Engine } from "./engine.ts";
import { createEngine } from "./engineFactory.ts";
import { withSearchSlot } from "./engineScheduler.ts";

/** Hard ceiling on a single engine search, regardless of how much clock it has. */
const MOVETIME_CAP_MS = Number(process.env.CHESS_MOVETIME_MS ?? 800);
const MOVETIME_FLOOR_MS = 100;
/** Rough "moves left in the game" divisor used to spread the clock out. */
const ASSUMED_MOVES_REMAINING = 30;

/** Abandoned games are reaped so their slot and engine process come back. */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

interface GameSessionOptions {
  colorChoice: ColorChoice;
  timeControl: TimeControlId;
  send: (message: ServerMessage) => void;
  /** Called once when the game is finished or abandoned, to release the slot. */
  onFinished: () => void;
}

/**
 * A single game: the authoritative position, both clocks, and the engine
 * process playing the other side.
 *
 * The client renders its own moves optimistically, but nothing here trusts it —
 * every move is re-validated against this `Chess` instance, including the
 * engine's replies.
 */
export class GameSession {
  readonly playerColor: PlayerColor;
  readonly engineColor: PlayerColor;
  readonly timeControl: TimeControlId;

  private game = new Chess();
  /** Long-algebraic move list, replayed to the engine as `position startpos moves ...`. */
  private uciMoves: string[] = [];
  private engine: Engine = createEngine();

  private whiteMs: number | null;
  private blackMs: number | null;
  private turnStartedAt = Date.now();
  private flagTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  private finished = false;
  private engineThinking = false;

  private readonly send: (message: ServerMessage) => void;
  private readonly onFinished: () => void;

  constructor(options: GameSessionOptions) {
    this.playerColor =
      options.colorChoice === "random"
        ? Math.random() < 0.5
          ? "white"
          : "black"
        : options.colorChoice;
    this.engineColor = this.playerColor === "white" ? "black" : "white";
    this.timeControl = options.timeControl;
    this.send = options.send;
    this.onFinished = options.onFinished;

    const startMs = timeControlMs(options.timeControl);
    this.whiteMs = startMs;
    this.blackMs = startMs;
  }

  async start() {
    try {
      await this.engine.init();
      await this.engine.newGame();
    } catch (err) {
      console.error("[chess] engine failed to start:", err);
      this.send({ type: "error", message: "The engine could not be started." });
      this.dispose();
      this.onFinished();
      return;
    }

    this.send({
      type: "game_started",
      color: this.playerColor,
      timeControl: this.timeControl,
      fen: this.game.fen(),
      whiteMs: this.whiteMs,
      blackMs: this.blackMs,
    });

    this.turnStartedAt = Date.now();
    this.armFlagTimer();
    this.touch();

    if (this.engineColor === "white") void this.playEngineMove();
  }

  handleMove(from: Square, to: Square, promotion?: PromotionPiece) {
    if (this.finished) return;
    this.touch();

    // Reject out-of-turn input outright rather than letting chess.js interpret
    // it as a move for the engine's side.
    if (this.game.turn() !== this.playerColor[0] || this.engineThinking) {
      this.send({ type: "illegal_move", fen: this.game.fen() });
      return;
    }

    let move;
    try {
      move = this.game.move({ from, to, promotion });
    } catch {
      this.send({ type: "illegal_move", fen: this.game.fen() });
      return;
    }

    this.uciMoves.push(move.lan);
    this.deductClock(this.playerColor);

    this.send({
      type: "move",
      san: move.san,
      from: move.from,
      to: move.to,
      fen: this.game.fen(),
      turn: this.game.turn(),
      whiteMs: this.whiteMs,
      blackMs: this.blackMs,
      byEngine: false,
    });

    if (this.hasFlagged(this.playerColor)) {
      this.endGame(this.engineColor, "timeout");
      return;
    }
    if (this.checkGameOver()) return;

    this.armFlagTimer();
    void this.playEngineMove();
  }

  resign() {
    if (this.finished) return;
    this.endGame(this.engineColor, "resignation");
  }

  /** Tear down without notifying anyone — used when the socket is already gone. */
  dispose() {
    this.finished = true;
    if (this.flagTimer) clearTimeout(this.flagTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.flagTimer = null;
    this.idleTimer = null;
    this.engine.kill();
  }

  private async playEngineMove() {
    if (this.finished) return;
    this.engineThinking = true;

    try {
      const movetime = this.engineMovetimeMs();
      const moves = [...this.uciMoves];
      const best = await withSearchSlot(() => this.engine.bestMove(moves, movetime));

      if (this.finished) return;
      if (!best) {
        // No legal move means the game is already over; chess.js agrees below.
        this.checkGameOver();
        return;
      }

      let move;
      try {
        move = this.game.move(best);
      } catch {
        // A bad reply would silently desync the board from the engine's own
        // position, so treat it as fatal rather than guessing.
        throw new Error(`Engine returned an illegal move: ${best}`);
      }

      this.uciMoves.push(move.lan);
      this.deductClock(this.engineColor);

      this.send({
        type: "move",
        san: move.san,
        from: move.from,
        to: move.to,
        fen: this.game.fen(),
        turn: this.game.turn(),
        whiteMs: this.whiteMs,
        blackMs: this.blackMs,
        byEngine: true,
      });

      if (this.hasFlagged(this.engineColor)) {
        this.endGame(this.playerColor, "timeout");
        return;
      }
      if (this.checkGameOver()) return;

      this.armFlagTimer();
    } catch (err) {
      if (this.finished) return;
      console.error("[chess] engine move failed:", err);
      this.endGame(this.playerColor, "engine_error");
    } finally {
      this.engineThinking = false;
    }
  }

  /** Budget for the engine's next search, bounded by its own remaining clock. */
  private engineMovetimeMs(): number {
    const remaining = this.engineColor === "white" ? this.whiteMs : this.blackMs;
    if (remaining === null) return MOVETIME_CAP_MS;
    const share = Math.floor(remaining / ASSUMED_MOVES_REMAINING);
    return Math.max(MOVETIME_FLOOR_MS, Math.min(MOVETIME_CAP_MS, share));
  }

  /** Deduct the time `mover` just spent and restart the clock for the other side. */
  private deductClock(mover: PlayerColor) {
    if (this.whiteMs === null || this.blackMs === null) return;

    const now = Date.now();
    const elapsed = now - this.turnStartedAt;
    this.turnStartedAt = now;

    if (mover === "white") this.whiteMs = Math.max(0, this.whiteMs - elapsed);
    else this.blackMs = Math.max(0, this.blackMs - elapsed);
  }

  private hasFlagged(mover: PlayerColor): boolean {
    const remaining = mover === "white" ? this.whiteMs : this.blackMs;
    return remaining !== null && remaining <= 0;
  }

  /** Fire a timeout loss exactly when the side to move would run out. */
  private armFlagTimer() {
    if (this.flagTimer) clearTimeout(this.flagTimer);
    this.flagTimer = null;
    if (this.whiteMs === null || this.blackMs === null) return;

    const toMove: PlayerColor = this.game.turn() === "w" ? "white" : "black";
    const remaining = toMove === "white" ? this.whiteMs : this.blackMs;

    this.flagTimer = setTimeout(() => {
      if (this.finished) return;
      if (toMove === "white") this.whiteMs = 0;
      else this.blackMs = 0;
      this.endGame(toMove === "white" ? "black" : "white", "timeout");
    }, remaining);
  }

  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.finished) return;
      this.send({ type: "error", message: "Game abandoned after 10 minutes of inactivity." });
      this.dispose();
      this.onFinished();
    }, IDLE_TIMEOUT_MS);
  }

  /** Returns true if the game ended on this position. */
  private checkGameOver(): boolean {
    if (!this.game.isGameOver()) return false;

    if (this.game.isCheckmate()) {
      // The side to move is the one that got mated.
      this.endGame(this.game.turn() === "w" ? "black" : "white", "checkmate");
    } else if (this.game.isStalemate()) {
      this.endGame("draw", "stalemate");
    } else if (this.game.isInsufficientMaterial()) {
      this.endGame("draw", "insufficient_material");
    } else if (this.game.isThreefoldRepetition()) {
      this.endGame("draw", "threefold_repetition");
    } else if (this.game.isDrawByFiftyMoves()) {
      this.endGame("draw", "fifty_move");
    } else {
      this.endGame("draw", "draw");
    }
    return true;
  }

  private endGame(result: GameResult, reason: GameOverReason) {
    if (this.finished) return;
    const payload: ServerMessage = {
      type: "game_over",
      result,
      reason,
      moves: this.game.history(),
      fen: this.game.fen(),
    };
    this.dispose();
    this.send(payload);
    this.onFinished();
  }
}
