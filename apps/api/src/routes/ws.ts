import type { FastifyInstance } from "fastify";
import { jobEvents } from "../lib/events.js";

/**
 * WebSocket endpoint at /ws.
 *
 * Job updates are forwarded to the connections entitled to them: an
 * administrator receives everything, everyone else only their own jobs. The
 * socket is the live half of the same rule the REST list obeys, and leaving it
 * open would have made that rule decorative — progress, titles and URLs for
 * every member were being pushed to every browser.
 */
export async function wsRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, req) => {
    const user = req.user;
    const isAdmin = user?.effective.isAdmin ?? false;

    const unsubscribe = jobEvents.onMessage(({ msg, ownerId }) => {
      // Ownerless jobs predate accounts and belong to the administrator, the
      // same way the pre-existing library does.
      if (!isAdmin && (ownerId == null || ownerId !== user?.id)) return;
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
