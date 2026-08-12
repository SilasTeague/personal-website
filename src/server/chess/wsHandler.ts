import type { WebSocketServer } from "ws";
import type { Square } from "chess.js";
import type {
  ClientMessage,
  ColorChoice,
  PromotionPiece,
  TimeControlId,
} from "../../features/chess/protocol.ts";
import { TIME_CONTROLS } from "../../features/chess/protocol.ts";
import { addConnection, removeConnection, startGame, type Connection } from "./sessionManager.ts";

const COLOR_CHOICES: ColorChoice[] = ["white", "black", "random"];
const PROMOTIONS: PromotionPiece[] = ["q", "r", "b", "n"];
const SQUARE_PATTERN = /^[a-h][1-8]$/;

/** Nothing off the wire is trusted; unrecognised shapes are dropped. */
function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;

  switch (msg.type) {
    case "new_game": {
      const color = msg.color as ColorChoice;
      const timeControl = msg.timeControl as TimeControlId;
      if (!COLOR_CHOICES.includes(color)) return null;
      if (!TIME_CONTROLS.some((tc) => tc.id === timeControl)) return null;
      return { type: "new_game", color, timeControl };
    }
    case "move": {
      const { from, to, promotion } = msg;
      if (typeof from !== "string" || !SQUARE_PATTERN.test(from)) return null;
      if (typeof to !== "string" || !SQUARE_PATTERN.test(to)) return null;
      if (promotion !== undefined && !PROMOTIONS.includes(promotion as PromotionPiece)) return null;
      return {
        type: "move",
        from: from as Square,
        to: to as Square,
        promotion: promotion as PromotionPiece | undefined,
      };
    }
    case "resign":
      return { type: "resign" };
    default:
      return null;
  }
}

function handleMessage(conn: Connection, raw: string) {
  const message = parseClientMessage(raw);
  if (!message) return;

  switch (message.type) {
    case "new_game":
      startGame(conn, message.color, message.timeControl);
      break;
    case "move":
      conn.session?.handleMove(message.from, message.to, message.promotion);
      break;
    case "resign":
      conn.session?.resign();
      break;
  }
}

export function attachChessSocket(wss: WebSocketServer) {
  wss.on("connection", (ws) => {
    const conn = addConnection(ws);

    ws.on("message", (raw) => {
      try {
        handleMessage(conn, raw.toString());
      } catch (err) {
        console.error("[chess] failed to handle client message:", err);
      }
    });

    ws.on("close", () => removeConnection(conn));
    ws.on("error", () => removeConnection(conn));
  });
}
