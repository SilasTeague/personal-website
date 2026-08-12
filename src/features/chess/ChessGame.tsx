"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import Board from "./Board";
import Clock from "./Clock";
import GameSetup from "./GameSetup";
import MoveList from "./MoveList";
import styles from "./chess.module.css";
import { useChessSocket } from "./useChessSocket";
import {
  MAX_SESSIONS,
  type ColorChoice,
  type GameOverReason,
  type GameResult,
  type PlayerColor,
  type PromotionPiece,
  type ServerMessage,
  type TimeControlId,
} from "./protocol";

const START_FEN = new Chess().fen();

type Phase = "lobby" | "starting" | "playing" | "over";

interface HistoryEntry {
  san: string;
  from: Square;
  to: Square;
  /** Position *after* this move, so replay is a direct lookup. */
  fen: string;
}

/** A move rendered before the server has confirmed it. */
interface OptimisticMove {
  fen: string;
  from: Square;
  to: Square;
}

interface Clocks {
  whiteMs: number | null;
  blackMs: number | null;
  /** When the server snapshot was taken, for local interpolation. */
  snapshotAt: number;
  running: "w" | "b" | null;
}

const IDLE_CLOCKS: Clocks = { whiteMs: null, blackMs: null, snapshotAt: 0, running: null };

export default function ChessGame() {
  const [phase, setPhase] = useState<Phase>("lobby");
  const [slotsFree, setSlotsFree] = useState(MAX_SESSIONS);
  const [slotsTotal, setSlotsTotal] = useState(MAX_SESSIONS);
  const [playerColor, setPlayerColor] = useState<PlayerColor>("white");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [optimistic, setOptimistic] = useState<OptimisticMove | null>(null);
  const [clocks, setClocks] = useState<Clocks>(IDLE_CLOCKS);
  const [outcome, setOutcome] = useState<{ result: GameResult; reason: GameOverReason } | null>(
    null
  );
  const [notice, setNotice] = useState<string | null>(null);
  /** Ply being reviewed after the game; null means "at the latest position". */
  const [replayPly, setReplayPly] = useState<number | null>(null);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "lobby":
        setSlotsFree(message.slotsFree);
        setSlotsTotal(message.slotsTotal);
        break;

      case "game_started":
        setPhase("playing");
        setPlayerColor(message.color);
        setHistory([]);
        setOptimistic(null);
        setOutcome(null);
        setNotice(null);
        setReplayPly(null);
        setClocks({
          whiteMs: message.whiteMs,
          blackMs: message.blackMs,
          snapshotAt: Date.now(),
          running: "w",
        });
        break;

      case "move":
        setHistory((current) => [
          ...current,
          { san: message.san, from: message.from, to: message.to, fen: message.fen },
        ]);
        // The server has caught up, so the optimistic copy is redundant.
        setOptimistic(null);
        setClocks({
          whiteMs: message.whiteMs,
          blackMs: message.blackMs,
          snapshotAt: Date.now(),
          running: message.turn,
        });
        break;

      case "illegal_move":
        // Dropping the optimistic move snaps the board back to server truth,
        // which is exactly the position the confirmed history describes.
        setOptimistic(null);
        break;

      case "game_over":
        setOutcome({ result: message.result, reason: message.reason });
        setOptimistic(null);
        setClocks((current) => ({ ...current, running: null }));
        setReplayPly(null);
        setPhase("over");
        break;

      case "server_full":
        setPhase("lobby");
        setNotice(`All ${MAX_SESSIONS} boards are busy right now. Please try again shortly.`);
        break;

      case "error":
        setPhase((current) => (current === "playing" || current === "starting" ? "lobby" : current));
        setOptimistic(null);
        setNotice(message.message);
        break;
    }
  }, []);

  const { status, send } = useChessSocket(handleMessage);

  const startGame = useCallback(
    (color: ColorChoice, timeControl: TimeControlId) => {
      setNotice(null);
      setPhase("starting");
      send({ type: "new_game", color, timeControl });
    },
    [send]
  );

  /** The position actually on the board right now, optimistic move included. */
  const live = useMemo(() => {
    if (optimistic) {
      return {
        fen: optimistic.fen,
        lastMove: { from: optimistic.from, to: optimistic.to },
      };
    }
    const last = history.at(-1);
    return last
      ? { fen: last.fen, lastMove: { from: last.from, to: last.to } }
      : { fen: START_FEN, lastMove: null };
  }, [optimistic, history]);

  const handleMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      // Render the move immediately; the server confirms (or rejects) after.
      const board = new Chess(live.fen);
      try {
        board.move({ from, to, promotion });
      } catch {
        return;
      }
      setOptimistic({ fen: board.fen(), from, to });
      send({ type: "move", from, to, promotion });
    },
    [live.fen, send]
  );

  // Local clock interpolation between server snapshots.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (clocks.running === null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [clocks.running]);

  const ply = replayPly ?? history.length;

  // Arrow-key replay, active only once the game is finished so it can never
  // interfere with play.
  useEffect(() => {
    if (phase !== "over") return;
    const total = history.length;

    const handleKey = (event: KeyboardEvent) => {
      let next: number | null = null;
      if (event.key === "ArrowLeft") next = Math.max(0, ply - 1);
      else if (event.key === "ArrowRight") next = Math.min(total, ply + 1);
      else if (event.key === "ArrowUp" || event.key === "Home") next = 0;
      else if (event.key === "ArrowDown" || event.key === "End") next = total;
      if (next === null) return;
      event.preventDefault();
      setReplayPly(next);
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, ply, history.length]);

  const view = useMemo(() => {
    if (phase !== "over") return live;
    if (ply === 0) return { fen: START_FEN, lastMove: null };
    const entry = history[ply - 1];
    return entry ? { fen: entry.fen, lastMove: { from: entry.from, to: entry.to } } : live;
  }, [phase, ply, history, live]);

  if (phase === "lobby" || phase === "starting") {
    return (
      <main className={styles.page}>
        {notice && <p className={styles.notice}>{notice}</p>}
        <GameSetup
          slotsFree={slotsFree}
          slotsTotal={slotsTotal}
          connected={status === "open"}
          starting={phase === "starting"}
          onStart={startGame}
        />
        {status === "closed" && (
          <p className={styles.notice}>
            Lost the connection to the server. Reload the page to play again.
          </p>
        )}
      </main>
    );
  }

  const playerSide: "w" | "b" = playerColor === "white" ? "w" : "b";
  const opponentSide: "w" | "b" = playerColor === "white" ? "b" : "w";
  const liveTurn = live.fen.split(" ")[1] as "w" | "b";
  const engineThinking = phase === "playing" && liveTurn !== playerSide;
  const interactive = phase === "playing" && liveTurn === playerSide;

  const displayMs = (side: "w" | "b") => {
    const base = side === "w" ? clocks.whiteMs : clocks.blackMs;
    if (base === null) return null;
    if (clocks.running !== side) return base;
    return Math.max(0, base - (now - clocks.snapshotAt));
  };

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.boardColumn}>
          <Clock
            ms={displayMs(opponentSide)}
            label="Dahlia"
            running={phase === "playing" && clocks.running === opponentSide}
          />
          <Board
            fen={view.fen}
            orientation={playerColor}
            lastMove={view.lastMove}
            interactive={interactive}
            playerColor={playerColor}
            onMove={handleMove}
          />
          <Clock
            ms={displayMs(playerSide)}
            label="You"
            running={phase === "playing" && clocks.running === playerSide}
          />
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.statusLine}>
            {phase === "over" && outcome
              ? describeOutcome(outcome.result, outcome.reason, playerColor)
              : engineThinking
                ? "Dahlia is thinking…"
                : "Your move"}
          </div>

          <MoveList
            sans={history.map((entry) => entry.san)}
            ply={ply}
            onSelectPly={phase === "over" ? setReplayPly : null}
          />

          {phase === "over" ? (
            <>
              <div className={styles.replayControls}>
                <button type="button" onClick={() => setReplayPly(0)} disabled={ply === 0}>
                  ⏮
                </button>
                <button
                  type="button"
                  onClick={() => setReplayPly(Math.max(0, ply - 1))}
                  disabled={ply === 0}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setReplayPly(Math.min(history.length, ply + 1))}
                  disabled={ply === history.length}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setReplayPly(history.length)}
                  disabled={ply === history.length}
                >
                  ⏭
                </button>
              </div>
              <p className={styles.replayHint}>Use ← and → to step through the game.</p>
              <button
                type="button"
                className={styles.startButton}
                onClick={() => {
                  setPhase("lobby");
                  setNotice(null);
                }}
              >
                New game
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.resignButton}
              onClick={() => send({ type: "resign" })}
            >
              Resign
            </button>
          )}

          {notice && <p className={styles.notice}>{notice}</p>}
        </aside>
      </div>
    </main>
  );
}

function describeOutcome(result: GameResult, reason: GameOverReason, playerColor: PlayerColor) {
  const reasons: Record<GameOverReason, string> = {
    checkmate: "by checkmate",
    stalemate: "by stalemate",
    timeout: "on time",
    resignation: "by resignation",
    insufficient_material: "— insufficient material",
    threefold_repetition: "by repetition",
    fifty_move: "by the fifty-move rule",
    draw: "",
    engine_error: "— the engine failed",
  };

  const detail = reasons[reason];
  if (result === "draw") return `Draw ${detail}`.trim();
  return `${result === playerColor ? "You win" : "Dahlia wins"} ${detail}`.trim();
}
