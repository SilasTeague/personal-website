// Custom Node server: hosts Next and a WebSocket endpoint in one process.
// Next's App Router can't accept WebSocket upgrades from a route handler, so
// the chess game needs the HTTP server itself.
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { CHESS_WS_PATH } from "./src/features/chess/protocol.ts";
import { attachChessSocket } from "./src/server/chess/wsHandler.ts";
import { disposeAll } from "./src/server/chess/sessionManager.ts";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port, turbopack: dev });
const handleRequest = app.getRequestHandler();

await app.prepare();

// Only valid once prepare() has resolved.
const handleNextUpgrade = app.getUpgradeHandler();

const server = createServer((req, res) => {
  // Left unparsed on purpose: Next does it internally, and node:url's parse()
  // is deprecated.
  handleRequest(req, res).catch((err) => {
    console.error("[server] request failed:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  });
});

const wss = new WebSocketServer({ noServer: true });
attachChessSocket(wss);

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (pathname === CHESS_WS_PATH) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    return;
  }

  // Everything else is Next's — in dev this carries hot-module-reload traffic,
  // so it must be forwarded rather than dropped.
  handleNextUpgrade(req, socket, head).catch((err) => {
    console.error("[server] upgrade failed:", err);
    socket.destroy();
  });
});

server.listen(port, hostname, () => {
  console.log(`[server] ready on http://${hostname}:${port} (${dev ? "dev" : "production"})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down`);
    disposeAll();
    server.close(() => process.exit(0));
    // Don't let a lingering keep-alive socket block the exit.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
