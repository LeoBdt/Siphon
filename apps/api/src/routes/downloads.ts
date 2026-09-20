import type { FastifyInstance } from "fastify";
import type { CreateDownloadRequest, DownloadStatus } from "@app/shared";
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
  app.post("/api/downloads", async (req, reply) => {
    const body = req.body as Partial<CreateDownloadRequest>;
    if (!body?.url || typeof body.url !== "string") {
      return reply.code(400).send({ error: "url requise" });
    }
    if (!isPresetId(body.preset)) {
      return reply.code(400).send({ error: "preset invalide" });
    }
    const destPath = body.destPath ?? "";
    try {
      resolveInsideRoot(destPath);
    } catch (err) {
      const code = err instanceof PathError ? err.statusCode : 400;
      return reply.code(code).send({ error: (err as Error).message });
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
      const job = await createDownload({
        url: body.url,
        preset: body.preset,
        destPath,
        advanced,
        playlistItems,
      });
      return reply.code(201).send(job);
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
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
