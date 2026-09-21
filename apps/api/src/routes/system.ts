import type { FastifyInstance } from "fastify";
import { statfs } from "node:fs/promises";
import { createRequire } from "node:module";
import type {
  ApiErrorBody,
  AppSettings,
  CleanupResult,
  DiskUsage,
  ReleaseCheck,
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
import {
  isAutoUpdateEnabled,
  lastCheckedAt,
  recordCheck,
  setAutoUpdateEnabled,
} from "../lib/ytdlp-autoupdate.js";
import { ytdlpUpdate, ytdlpVersion } from "../lib/ytdlp-system.js";
import { checkLatestRelease } from "../lib/release-check.js";
import { requirePermission } from "../auth/guard.js";

/**
 * The version this build reports.
 *
 * Read from package.json rather than `npm_package_version`, which only exists
 * when the process was started by a package script — it is not set in the
 * container, where the server is launched directly, and the check would have
 * compared every release against "0.0.0" and always claimed an update.
 */
const APP_VERSION = (() => {
  try {
    const pkg = createRequire(import.meta.url)("../../package.json") as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

export async function systemRoutes(app: FastifyInstance) {
  // Current settings.
  app.get("/api/settings", async (): Promise<AppSettings> => ({
    maxConcurrentDownloads: getMaxConcurrent(),
    autoUpdateYtdlp: isAutoUpdateEnabled(),
  }));

  // Update settings. Every field is optional: the page sends only what the
  // user touched, so a card never overwrites a setting it does not own.
  app.put("/api/settings", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<AppSettings>;

    if (body.maxConcurrentDownloads !== undefined) {
      const n = body.maxConcurrentDownloads;
      if (typeof n !== "number" || !Number.isFinite(n)) {
        return reply.code(400).send({
          code: "concurrency_out_of_range",
          error: "maxConcurrentDownloads must be a number",
        } satisfies ApiErrorBody);
      }
      // Rejected rather than silently clamped, so the client never shows a
      // value the server did not accept.
      if (n < CONCURRENCY_MIN || n > CONCURRENCY_MAX) {
        return reply.code(400).send({
          code: "concurrency_out_of_range",
          error: `maxConcurrentDownloads must be between ${CONCURRENCY_MIN} and ${CONCURRENCY_MAX}`,
        } satisfies ApiErrorBody);
      }
      setMaxConcurrent(n);
    }

    if (body.autoUpdateYtdlp !== undefined) {
      setAutoUpdateEnabled(Boolean(body.autoUpdateYtdlp));
    }

    return {
      maxConcurrentDownloads: getMaxConcurrent(),
      autoUpdateYtdlp: isAutoUpdateEnabled(),
    } satisfies AppSettings;
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
    lastCheckedAt: lastCheckedAt(),
  }));

  /**
   * Ask GitHub whether a newer Siphon has been released.
   *
   * A POST although it reads nothing: it is the one action in the app that
   * leaves the machine, so it happens when somebody asks for it and never on
   * a schedule or a page load. Administrators only — it is their decision to
   * make, not a member's.
   */
  app.post(
    "/api/system/release-check",
    { preHandler: requirePermission("isAdmin") },
    async (): Promise<ReleaseCheck> => checkLatestRelease(APP_VERSION),
  );

  /**
   * Trigger a yt-dlp self-update (yt-dlp -U).
   *
   * The verdict is decided here, by comparing the version before and after —
   * not by handing yt-dlp's own two lines of prose to the interface. Those
   * lines ("Latest version: stable@…, yt-dlp is up to date") take a moment to
   * read before they admit nothing happened, and they are English whatever
   * language the app is set to.
   */
  app.post("/api/system/ytdlp/update", async (): Promise<YtdlpUpdateResult> => {
    const previousVersion = await ytdlpVersion();
    const { ok, output } = await ytdlpUpdate();
    recordCheck();
    const version = await ytdlpVersion();
    const status = !ok
      ? "failed"
      : version && previousVersion && version !== previousVersion
        ? "updated"
        : "already-current";
    return { ok, version, previousVersion, status, message: output };
  });
}
