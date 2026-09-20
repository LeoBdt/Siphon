import type { FastifyInstance } from "fastify";
import { statfs } from "node:fs/promises";
import type {
  ApiErrorBody,
  AppSettings,
  CleanupResult,
  DiskUsage,
  YtdlpInfo,
  YtdlpUpdateResult,
} from "@app/shared";
import { CONCURRENCY_MAX, CONCURRENCY_MIN } from "@app/shared";
import { config } from "../config.js";
import {
  activeJobCount,
  getMaxConcurrent,
  setMaxConcurrent,
} from "../downloads-manager.js";
import { cleanStalePartials } from "../lib/cleanup.js";
import { ytdlpUpdate, ytdlpVersion } from "../lib/ytdlp-system.js";

export async function systemRoutes(app: FastifyInstance) {
  // Current settings.
  app.get("/api/settings", async (): Promise<AppSettings> => ({
    maxConcurrentDownloads: getMaxConcurrent(),
  }));

  // Update settings (currently just the download concurrency).
  app.put("/api/settings", async (req, reply) => {
    const body = req.body as Partial<AppSettings>;
    const n = body?.maxConcurrentDownloads;
    if (typeof n !== "number" || !Number.isFinite(n)) {
      return reply.code(400).send({
        code: "concurrency_out_of_range",
        error: "maxConcurrentDownloads must be a number",
      } satisfies ApiErrorBody);
    }
    // Reject out-of-range values instead of silently clamping them, so the
    // client never shows a value the server did not accept.
    if (n < CONCURRENCY_MIN || n > CONCURRENCY_MAX) {
      return reply.code(400).send({
        code: "concurrency_out_of_range",
        error: `maxConcurrentDownloads must be between ${CONCURRENCY_MIN} and ${CONCURRENCY_MAX}`,
      } satisfies ApiErrorBody);
    }
    const maxConcurrentDownloads = setMaxConcurrent(n);
    return { maxConcurrentDownloads } satisfies AppSettings;
  });

  // Sweep leftover yt-dlp temp files (partials, un-merged DASH streams).
  // Refused while downloads run: their in-flight partials look identical.
  app.post("/api/system/cleanup", async (_req, reply) => {
    if (activeJobCount() > 0) {
      return reply.code(409).send({
        code: "downloads_active",
        error: "Downloads are running — try again once they finish.",
      } satisfies ApiErrorBody);
    }
    // maxAge 0: the user asked for it explicitly and nothing is running.
    const swept = await Promise.all([
      cleanStalePartials(config.rootDir, 0),
      cleanStalePartials(config.tmpDir, 0),
    ]);
    return {
      removed: swept.reduce((n, r) => n + r.removed, 0),
      bytesFreed: swept.reduce((n, r) => n + r.bytesFreed, 0),
    } satisfies CleanupResult;
  });

  // Free/used space of the volume that backs the library.
  app.get("/api/system/disk", async (): Promise<DiskUsage> => {
    const s = await statfs(config.rootDir);
    const totalBytes = s.blocks * s.bsize;
    const freeBytes = s.bavail * s.bsize;
    return { totalBytes, freeBytes, usedBytes: totalBytes - freeBytes };
  });

  // Installed yt-dlp version.
  app.get("/api/system/ytdlp", async (): Promise<YtdlpInfo> => ({
    version: await ytdlpVersion(),
  }));

  // Trigger a yt-dlp self-update (yt-dlp -U).
  app.post("/api/system/ytdlp/update", async (): Promise<YtdlpUpdateResult> => {
    const { ok, output } = await ytdlpUpdate();
    const version = await ytdlpVersion();
    return {
      ok,
      version,
      message:
        output || (ok ? "yt-dlp is up to date." : "Update failed."),
    };
  });
}
