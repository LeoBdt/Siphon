import { EventEmitter } from "node:events";
import type { DownloadJob, WsServerMessage } from "@app/shared";

/**
 * Tiny in-process event bus. The queue/download runners emit job updates here;
 * the WebSocket route subscribes and forwards them to connected clients.
 */
class JobEvents extends EventEmitter {
  emitUpdate(job: DownloadJob) {
    const msg: WsServerMessage = { type: "job:update", job };
    this.emit("message", msg);
  }
  emitLog(jobId: string, line: string) {
    const msg: WsServerMessage = { type: "job:log", jobId, line };
    this.emit("message", msg);
  }
  onMessage(fn: (msg: WsServerMessage) => void) {
    this.on("message", fn);
    return () => this.off("message", fn);
  }
}

export const jobEvents = new JobEvents();
// Many WS clients may subscribe; lift the default listener cap.
jobEvents.setMaxListeners(0);
