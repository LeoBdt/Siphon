import { EventEmitter } from "node:events";
import type { DownloadJob, WsServerMessage } from "@app/shared";

/**
 * Tiny in-process event bus. The queue/download runners emit job updates here;
 * the WebSocket route subscribes and forwards them to connected clients.
 */
/**
 * Every message carries the id of whoever owns the job, so the socket route
 * can decide who is allowed to receive it. A log line has no job attached, so
 * the owner is looked up once at emission rather than on each subscriber.
 */
export interface Envelope {
  msg: WsServerMessage;
  ownerId: string | null;
}

class JobEvents extends EventEmitter {
  emitUpdate(job: DownloadJob) {
    const msg: WsServerMessage = { type: "job:update", job };
    this.emit("message", { msg, ownerId: job.userId ?? null } satisfies Envelope);
  }
  emitLog(jobId: string, line: string, ownerId: string | null = null) {
    const msg: WsServerMessage = { type: "job:log", jobId, line };
    this.emit("message", { msg, ownerId } satisfies Envelope);
  }
  onMessage(fn: (e: Envelope) => void) {
    this.on("message", fn);
    return () => this.off("message", fn);
  }
}

export const jobEvents = new JobEvents();
// Many WS clients may subscribe; lift the default listener cap.
jobEvents.setMaxListeners(0);
