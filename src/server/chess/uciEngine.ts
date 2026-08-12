import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Engine } from "./engine.ts";

/** Transposition table size per engine process. Three sessions => 48MB worst case. */
const HASH_MB = 16;

/** Dahlia reports "bestmove 0000" when the position has no legal move. */
const NULL_MOVE = "0000";

/**
 * Grace on top of the requested movetime before we intervene in a search.
 * Dahlia checks its deadline every 2048 nodes, so real overshoot is tiny.
 * Intervening is cheap now that `stop` works, so this is deliberately shorter
 * than the budget a hard kill would justify.
 */
const WATCHDOG_GRACE_MS = 1500;

/**
 * How long a `stop` gets to produce a bestmove before we kill the process.
 * A stopped search returns within a few nodes, so this is generous.
 */
const STOP_GRACE_MS = 1000;

const HANDSHAKE_TIMEOUT_MS = 5000;

/**
 * Speaks UCI to a Dahlia process over stdin/stdout.
 *
 * Dahlia runs its search on its own thread (see the engine's
 * docs/adr/0003-async-search-stop.md), which shapes two things here:
 *
 * - An overrunning search is recoverable. `stop` makes it return the best move
 *   it has found so far, so a wedged-looking search costs a slightly late move
 *   rather than the whole game. Killing the process is now the last resort, not
 *   the first.
 * - Only one `go` may be in flight. A second `go` arriving mid-search is
 *   silently dropped by the engine with no `bestmove`, which would strand this
 *   client until the watchdog fired — so the `searching` guard below is load
 *   bearing, not just tidiness.
 *
 * The search is still single-threaded and CPU-bound for its whole movetime, so
 * bounding it up front with `movetime` still matters just as much.
 */
export class UciEngine implements Engine {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = "";
  private listeners: ((line: string) => void)[] = [];
  private dead = false;
  private searching = false;

  constructor(enginePath: string) {
    this.proc = spawn(enginePath, [], { stdio: "pipe" });

    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      let newlineIdx: number;
      while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, newlineIdx).replace(/\r$/, "");
        this.buffer = this.buffer.slice(newlineIdx + 1);
        // `info` lines stream throughout a search; only listeners care which
        // lines they want, so hand every non-empty line to all of them.
        if (line.length) for (const cb of [...this.listeners]) cb(line);
      }
    });

    this.proc.stderr.on("data", (chunk: Buffer) => {
      console.error("[dahlia stderr]", chunk.toString().trimEnd());
    });

    this.proc.on("exit", (code, signal) => {
      this.dead = true;
      if (code !== 0 && signal !== "SIGKILL") {
        console.error(`[dahlia] exited code=${code} signal=${signal}`);
      }
    });

    this.proc.on("error", (err) => {
      this.dead = true;
      console.error("[dahlia] process error:", err);
    });
  }

  private send(command: string) {
    if (this.dead || !this.proc.stdin.writable) {
      throw new Error("Engine process is not running");
    }
    this.proc.stdin.write(command + "\n");
  }

  /** Resolve with the first line matching `pattern`, or reject on timeout. */
  private waitFor(pattern: RegExp, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const detach = () => {
        this.listeners = this.listeners.filter((cb) => cb !== handler);
        clearTimeout(timer);
      };
      const handler = (line: string) => {
        if (!pattern.test(line)) return;
        detach();
        resolve(line);
      };
      const timer = setTimeout(() => {
        detach();
        reject(new Error(`Timed out waiting for ${pattern}`));
      }, timeoutMs);
      this.listeners.push(handler);
    });
  }

  async init() {
    this.send("uci");
    await this.waitFor(/^uciok$/, HANDSHAKE_TIMEOUT_MS);
    // Hash is the only option Dahlia declares; anything else is ignored.
    this.send(`setoption name Hash value ${HASH_MB}`);
    this.send("isready");
    await this.waitFor(/^readyok$/, HANDSHAKE_TIMEOUT_MS);
  }

  async newGame() {
    this.send("ucinewgame");
    this.send("isready");
    await this.waitFor(/^readyok$/, HANDSHAKE_TIMEOUT_MS);
  }

  async bestMove(moves: string[], movetimeMs: number): Promise<string | null> {
    if (this.searching) throw new Error("A search is already in flight");
    this.searching = true;
    try {
      const position =
        moves.length > 0 ? `position startpos moves ${moves.join(" ")}` : "position startpos";
      this.send(position);
      this.send(`go movetime ${Math.round(movetimeMs)}`);

      let line: string;
      try {
        line = await this.waitFor(/^bestmove\s+\S+/, movetimeMs + WATCHDOG_GRACE_MS);
      } catch (overrun) {
        // The search blew past its budget. Ask it to stop, which returns the
        // best move found so far, before writing the process off entirely.
        try {
          this.send("stop");
          line = await this.waitFor(/^bestmove\s+\S+/, STOP_GRACE_MS);
          console.warn("[dahlia] search overran its budget; recovered via stop");
        } catch {
          // Unresponsive even to stop: it would hold a core indefinitely.
          this.kill();
          throw overrun;
        }
      }

      const move = line.match(/^bestmove\s+(\S+)/)?.[1];
      return !move || move === NULL_MOVE ? null : move;
    } finally {
      this.searching = false;
    }
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    try {
      // `stop` unwinds any in-flight search so it stops consuming a core
      // right away; `quit` then joins that thread and exits on its own.
      if (this.proc.stdin.writable) this.proc.stdin.write("stop\nquit\n");
    } catch {
      // Already gone; the signals below are the backstop.
    }

    // A clean exit lands in a couple of milliseconds, so these only fire for a
    // process that has genuinely stopped listening.
    const term = setTimeout(() => this.proc.kill("SIGTERM"), 150);
    const hard = setTimeout(() => this.proc.kill("SIGKILL"), 600);
    // Never hold the event loop open just to escalate a kill.
    term.unref();
    hard.unref();
    this.proc.once("exit", () => {
      clearTimeout(term);
      clearTimeout(hard);
    });
  }
}
