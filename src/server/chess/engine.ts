/** What a game session needs from an opponent, real or stubbed. */
export interface Engine {
  /** Handshake. Must resolve before any search is requested. */
  init(): Promise<void>;
  /** Reset for a fresh game. */
  newGame(): Promise<void>;
  /**
   * Search the position reached by `moves` from the start position and return
   * the chosen move in UCI long-algebraic form (e.g. "e2e4", "e7e8q"), or null
   * if the engine reports no legal move.
   */
  bestMove(moves: string[], movetimeMs: number): Promise<string | null>;
  /** Terminate. Must be safe to call repeatedly. */
  kill(): void;
}
