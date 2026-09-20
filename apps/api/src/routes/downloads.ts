import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type {
  CreateDownloadRequest,
  DownloadStatus,
  RetentionMode,
} from "@app/shared";
import { config } from "../config.js";
import { requirePermission } from "../auth/guard.js";
import {
  getJob,
  listChildren,
  listJobs,
  type ListFilter,
} from "../db.js";
import {
  cancelDownload,
  createDownload,
  isPresetId,
  removeDownload,
  retryDownload,
} from "../downloads-manager.js";
import { probeInfo } from "../lib/ytdlp.js";
import { resolveInsideRoot, PathError } from "../lib/paths.js";

export async function downloadsRoutes(app: FastifyInstance) {
  // Probe a URL for a preview (title, thumbnail, playlist?) before downloading.
  app.get("/api/downloads/info", async (req, reply) => {
    const url = (req.query as { url?: string }).url;
    if (!url) return reply.code(400).send({ error: "url manquante" });
    try {
      const { info } = await probeInfo(url);
      return info;
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });

  // List top-level jobs (playlist children are nested under their parent).
  app.get("/api/downloads", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const filter: ListFilter = {
      status: q.status as DownloadStatus | undefined,
      search: q.search,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    };
    return listJobs(filter);
  });

  // Single job, with children when it's a playlist parent.
  app.get("/api/downloads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = getJob(id);
    if (!job) return reply.code(404).send({ code: "not_found", error: "Not found" });
    return {
      ...job,
      children: job.isPlaylistParent ? listChildren(id) : undefined,
    };
  });

  // Create a download (single video or playlist/channel).
  app.post(
    "/api/downloads",
    { preHandler: requirePermission("canDownload") },
    async (req, reply) => {
    const body = req.body as Partial<CreateDownloadRequest>;
    if (!body?.url || typeof body.url !== "string") {
      return reply.code(400).send({ error: "url requise" });
    }
    if (!isPresetId(body.preset)) {
      return reply.code(400).send({ error: "preset invalide" });
    }
    // Keeping a file on the server is a permission; fetching one once is not.
    // Anyone without it is silently moved to a direct download rather than
    // refused, because refusing would only teach them to ask again.
    const retention: RetentionMode = req.user?.effective.canKeepInLibrary
      ? (body.retention ?? "library")
      : "direct";

    const destPath = body.destPath ?? "";
    if (retention === "library") {
      try {
        resolveInsideRoot(destPath);
      } catch (err) {
        const code = err instanceof PathError ? err.statusCode : 400;
        return reply.code(code).send({ error: (err as Error).message });
      }
    }
    // Advanced overrides (resolution/fps) are optional and validated loosely.
    const advanced =
      body.advanced && typeof body.advanced === "object"
        ? {
            maxHeight:
              typeof body.advanced.maxHeight === "number"
                ? body.advanced.maxHeight
                : null,
            maxFps:
              typeof body.advanced.maxFps === "number"
                ? body.advanced.maxFps
                : null,
          }
        : null;
    const playlistItems = Array.isArray(body.playlistItems)
      ? body.playlistItems.filter((u): u is string => typeof u === "string")
      : null;
    try {
      const job = await createDownload(
        {
          url: body.url,
          preset: body.preset,
          destPath,
          advanced,
          playlistItems,
          retention,
        },
        req.user?.id ?? null,
      );
      return reply.code(201).send(job);
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
    },
  );

  /**
   * Hand over a direct download, then delete it.
   *
   * The whole point of the direct mode is that the server does not keep a
   * copy, so the file goes away as soon as it has been sent — and the folder
   * with it, since it exists only for this job.
   */
  app.get("/api/downloads/:id/file", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = getJob(id);
    if (!job || job.retention !== "direct" || !job.outputFile) {
      return reply.code(404).send({ code: "not_found", error: "Not found" });
    }
    // Someone else's download is not yours to collect.
    if (job.userId && job.userId !== req.user?.id && !req.user?.effective.isAdmin) {
      return reply.code(403).send({ code: "forbidden", error: "Not allowed" });
    }

    const name = job.outputFile.split(/[\/]/).pop() ?? "download";
    reply.header(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    const stream = createReadStream(job.outputFile);
    // Removed once the bytes are out, not before: a failed transfer would
    // otherwise destroy the only copy.
    stream.on("close", () => {
      void rm(join(config.tmpDir, "direct", job.id), {
        recursive: true,
        force: true,
      });
    });
    return reply.send(stream);
  });

  app.post("/api/downloads/:id/retry", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = retryDownload(id);
    if (!job) return reply.code(404).send({ code: "not_found", error: "Not found" });
    return job;
  });

  app.post("/api/downloads/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = cancelDownload(id);
    if (!job) return reply.code(404).send({ code: "not_found", error: "Not found" });
    return job;
  });

  app.delete("/api/downloads/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getJob(id)) return reply.code(404).send({ code: "not_found", error: "Not found" });
    removeDownload(id);
    return reply.code(204).send();
  });
}
