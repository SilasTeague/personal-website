import { Chess, type PieceSymbol } from "chess.js";
import type { Engine } from "./engine.ts";

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Stand-in opponent used when DAHLIA_ENGINE_PATH doesn't point at a runnable
 * binary — which is the case on any machine where Dahlia hasn't been built for
 * the host architecture yet.
 *
 * It is deliberately shallow (greedy capture search with a one-ply reply
 * check), but it takes a realistic amount of time to "think" so that clocks,
 * the search scheduler, and the UI's waiting states all behave exactly as they
 * will against the real engine.
 */
export class StubEngine implements Engine {
  private killed = false;

  async init() {}

  async newGame() {}

  async bestMove(moves: string[], movetimeMs: number): Promise<string | null> {
    const game = new Chess();
    for (const move of moves) game.move(move);

    const legal = game.moves({ verbose: true });
    if (legal.length === 0) return null;

    // Think for a plausible slice of the budget so latency looks real.
    await sleep(Math.min(movetimeMs, 250 + Math.random() * 400));
    if (this.killed) throw new Error("Engine was killed mid-search");

    let best = legal[0];
    let bestScore = -Infinity;

    for (const move of legal) {
      game.move(move);

      let score: number;
      if (game.isCheckmate()) {
        score = Infinity;
      } else {
        const gained = move.captured ? VALUE[move.captured] : 0;
        // One-ply safety check: assume the opponent grabs the most valuable
        // thing available in reply.
        const worstReply = game
          .moves({ verbose: true })
          .reduce((max, reply) => Math.max(max, reply.captured ? VALUE[reply.captured] : 0), 0);
        score = gained - worstReply + Math.random() * 0.5;
      }

      game.undo();

      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }

    return best.lan;
  }

  kill() {
    this.killed = true;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
