import type { WebSocket } from "ws";
import {
  MAX_SESSIONS,
  type ColorChoice,
  type ServerMessage,
  type TimeControlId,
} from "../../features/chess/protocol.ts";
import { GameSession } from "./gameSession.ts";

/** One connected browser. Holds a game only between `new_game` and game over. */
export interface Connection {
  ws: WebSocket;
  session: GameSession | null;
}

const connections = new Set<Connection>();

function activeSessions(): number {
  let count = 0;
  for (const conn of connections) if (conn.session) count++;
  return count;
}

function send(conn: Connection, message: ServerMessage) {
  // readyState 1 === OPEN; the socket may have closed mid-search.
  if (conn.ws.readyState !== 1) return;
  conn.ws.send(JSON.stringify(message));
}

function lobbyMessage(): ServerMessage {
  return {
    type: "lobby",
    slotsFree: MAX_SESSIONS - activeSessions(),
    slotsTotal: MAX_SESSIONS,
  };
}

/**
 * Push availability to everyone waiting in the lobby. Called whenever a slot
 * changes hands, so the setup screen stays live without any polling.
 */
function broadcastLobby() {
  const message = lobbyMessage();
  for (const conn of connections) {
    if (!conn.session) send(conn, message);
  }
}

export function addConnection(ws: WebSocket): Connection {
  const conn: Connection = { ws, session: null };
  connections.add(conn);
  send(conn, lobbyMessage());
  return conn;
}

export function removeConnection(conn: Connection) {
  if (!connections.delete(conn)) return;
  // "Kill the session on exit" — closing the tab reclaims the engine process.
  conn.session?.dispose();
  conn.session = null;
  broadcastLobby();
}

export function startGame(conn: Connection, colorChoice: ColorChoice, timeControl: TimeControlId) {
  if (conn.session) {
    send(conn, { type: "error", message: "A game is already in progress." });
    return;
  }

  // The slot is claimed synchronously below, before any await, so concurrent
  // requests can't both pass this check.
  if (activeSessions() >= MAX_SESSIONS) {
    send(conn, { type: "server_full" });
    return;
  }

  const session = new GameSession({
    colorChoice,
    timeControl,
    send: (message) => send(conn, message),
    onFinished: () => {
      if (!conn.session) return;
      conn.session = null;
      // This connection is back in the lobby, so the broadcast reaches it too
      // and a finished game can roll straight into a new one.
      broadcastLobby();
    },
  });

  conn.session = session;
  broadcastLobby();
  void session.start();
}

/** Kill every engine process — used on server shutdown. */
export function disposeAll() {
  for (const conn of connections) conn.session?.dispose();
  connections.clear();
}
