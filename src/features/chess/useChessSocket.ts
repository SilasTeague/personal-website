"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHESS_WS_PATH, type ClientMessage, type ServerMessage } from "./protocol";

export type SocketStatus = "connecting" | "open" | "closed";

/**
 * Owns the game socket for the lifetime of the page. There is deliberately no
 * reconnect: the server kills the engine when the socket drops, so a dropped
 * connection means the game is genuinely gone.
 */
export function useChessSocket(onMessage: (message: ServerMessage) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  // Kept in a ref so a changing handler identity never re-opens the socket.
  // Assigned in an effect (not during render) and before the socket effect
  // below runs, so no message can arrive against a stale handler.
  const handlerRef = useRef(onMessage);
  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}${CHESS_WS_PATH}`);
    socketRef.current = socket;

    socket.onopen = () => setStatus("open");
    socket.onclose = () => setStatus("closed");
    socket.onerror = () => setStatus("closed");
    socket.onmessage = (event) => {
      try {
        handlerRef.current(JSON.parse(event.data) as ServerMessage);
      } catch (err) {
        console.error("Malformed message from server:", err);
      }
    };

    return () => {
      socket.onclose = null;
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  return { status, send };
}
