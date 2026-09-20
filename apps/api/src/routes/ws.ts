import type { FastifyInstance } from "fastify";
import { jobEvents } from "../lib/events.js";

/**
 * WebSocket endpoint at /ws. Every job update/log emitted on the event bus is
 * forwarded to all connected clients as JSON (WsServerMessage).
 */
export async function wsRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket) => {
    const unsubscribe = jobEvents.onMessage((msg) => {
      try {
        socket.send(JSON.stringify(msg));
      } catch {
        /* socket may be closing */
      }
    });
    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });
}
