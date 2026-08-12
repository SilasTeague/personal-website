// Wire format shared by the browser client and the WebSocket server. Kept free
// of runtime imports so it can be pulled into a "use client" bundle and into
// the plain-Node custom server alike.
import type { Square } from "chess.js";

export const CHESS_WS_PATH = "/api/chess/ws";

/** Concurrent games allowed on the box. Each one owns a CPU-bound engine process. */
export const MAX_SESSIONS = 3;

export type PlayerColor = "white" | "black";
export type ColorChoice = PlayerColor | "random";
export type TimeControlId = "5" | "10" | "infinite";
export type PromotionPiece = "q" | "r" | "b" | "n";

export const TIME_CONTROLS: {
  id: TimeControlId;
  label: string;
  /** Starting clock per side, or null for an untimed game. */
  ms: number | null;
}[] = [
  { id: "5", label: "5 min", ms: 5 * 60 * 1000 },
  { id: "10", label: "10 min", ms: 10 * 60 * 1000 },
  { id: "infinite", label: "Infinite", ms: null },
];

export function timeControlMs(id: TimeControlId): number | null {
  return TIME_CONTROLS.find((tc) => tc.id === id)?.ms ?? null;
}

/** Winner of a finished game, or a draw. */
export type GameResult = "white" | "black" | "draw";

export type GameOverReason =
  | "checkmate"
  | "stalemate"
  | "timeout"
  | "resignation"
  | "insufficient_material"
  | "threefold_repetition"
  | "fifty_move"
  | "draw"
  | "engine_error";

export type ClientMessage =
  | { type: "new_game"; color: ColorChoice; timeControl: TimeControlId }
  | { type: "move"; from: Square; to: Square; promotion?: PromotionPiece }
  | { type: "resign" };

export type ServerMessage =
  /** Sent on connect and whenever a slot is taken or released. */
  | { type: "lobby"; slotsFree: number; slotsTotal: number }
  | {
      type: "game_started";
      color: PlayerColor;
      timeControl: TimeControlId;
      fen: string;
      whiteMs: number | null;
      blackMs: number | null;
    }
  | {
      type: "move";
      san: string;
      from: Square;
      to: Square;
      fen: string;
      /** Side to move *after* this move. */
      turn: "w" | "b";
      whiteMs: number | null;
      blackMs: number | null;
      byEngine: boolean;
    }
  /** The client's optimistic move was rejected; snap back to this position. */
  | { type: "illegal_move"; fen: string }
  | {
      type: "game_over";
      result: GameResult;
      reason: GameOverReason;
      /** Authoritative SAN list, for post-game replay. */
      moves: string[];
      fen: string;
    }
  | { type: "server_full" }
  | { type: "error"; message: string };
