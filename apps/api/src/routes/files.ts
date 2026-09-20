import { readdir, mkdir, rename, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, basename, join, dirname } from "node:path";
import archiver from "archiver";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { FileNode, ListDirResponse } from "@app/shared";
import {
  resolveInsideRoot,
  resolveExistingInsideRoot,
  normalizeRel,
  toRel,
  PathError,
} from "../lib/paths.js";
import { isTempArtifact } from "../lib/cleanup.js";
import { libraryRootFor, hiddenFrom } from "../auth/scope.js";
import { privateDirs } from "../auth/store.js";
import { requirePermission } from "../auth/guard.js";

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".srt": "text/plain",
  ".vtt": "text/vtt",
  ".json": "application/json",
};

function mimeFor(name: string): string | null {
  return MIME_BY_EXT[extname(name).toLowerCase()] ?? null;
}

async function toNode(
  absDir: string,
  name: string,
  base: string,
): Promise<FileNode> {
  const abs = join(absDir, name);
  const s = await stat(abs);
  const isDir = s.isDirectory();
  return {
    name,
    // Relative to the caller's own root, so a confined member never sees — or
    // has to send back — a path that mentions anyone else's folder.
    path: toRel(abs, base),
    type: isDir ? "directory" : "file",
    sizeBytes: isDir ? null : s.size,
    modifiedAt: s.mtime.toISOString(),
    mimeType: isDir ? null : mimeFor(name),
  };
}

function handleError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof PathError) {
    return reply.code(err.statusCode).send({ error: err.message });
  }
  const e = err as NodeJS.ErrnoException;
  if (e.code === "ENOENT") return reply.code(404).send({ code: "not_found", error: "Not found" });
  if (e.code === "EEXIST")
    return reply
      .code(409)
      .send({ code: "already_exists", error: "Already exists" });
  if (e.code === "ENOTEMPTY")
    return reply.code(409).send({ error: "Folder is not empty" });
  return reply.code(500).send({ error: (err as Error).message });
}

export async function filesRoutes(app: FastifyInstance) {
  // List a directory's entries (folders first, then files, name-sorted).
  app.get("/api/files", async (req, reply) => {
    const rel = (req.query as { path?: string }).path ?? "";
    const base = libraryRootFor(req.user);
    try {
      const abs = resolveExistingInsideRoot(rel, base);
      // Hide yt-dlp's work-in-progress artifacts: a half-written .part or an
      // un-merged .f401.mp4 is not a file the user owns, and showing them makes
      // the library look corrupted mid-download.
      const hidden = hiddenFrom(req.user, privateDirs());
      const names = (await readdir(abs)).filter(
        (n) => !isTempArtifact(n) && !hidden(n, normalizeRel(rel)),
      );
      const entries = await Promise.all(names.map((n) => toNode(abs, n, base)));
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
      const res: ListDirResponse = { path: normalizeRel(rel), entries };
      return res;
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // Create a folder: { path: parentRel, name }.
  app.post(
    "/api/files/folder",
    { preHandler: requirePermission("canManageFiles") },
    async (req, reply) => {
    const body = req.body as { path?: string; name?: string };
    const name = (body.name ?? "").trim();
    if (!name || /[\\/]/.test(name)) {
      return reply.code(400).send({ error: "nom de dossier invalide" });
    }
    try {
      const parent = resolveInsideRoot(body.path ?? "", libraryRootFor(req.user));
      const target = resolveInsideRoot(
        join(normalizeRel(body.path ?? ""), name),
        libraryRootFor(req.user),
      );
      // Guard: ensure the joined target is still inside root (belt & braces).
      void parent;
      await mkdir(target, { recursive: false });
      return reply
        .code(201)
        .send(
          await toNode(dirname(target), basename(target), libraryRootFor(req.user)),
        );
    } catch (err) {
      return handleError(reply, err);
    }
    },
  );

  // Move or rename: { from: rel, to: rel } where `to` is the full new rel path.
  app.patch(
    "/api/files",
    { preHandler: requirePermission("canManageFiles") },
    async (req, reply) => {
    const body = req.body as { from?: string; to?: string };
    if (!body.from || !body.to) {
      return reply.code(400).send({ error: "from et to requis" });
    }
    try {
      const fromAbs = resolveExistingInsideRoot(body.from, libraryRootFor(req.user));
      const toAbs = resolveInsideRoot(body.to, libraryRootFor(req.user));
      await rename(fromAbs, toAbs);
      return await toNode(dirname(toAbs), basename(toAbs), libraryRootFor(req.user));
    } catch (err) {
      return handleError(reply, err);
    }
    },
  );

  // Delete a file or folder (recursive for folders).
  app.delete(
    "/api/files",
    { preHandler: requirePermission("canManageFiles") },
    async (req, reply) => {
    const rel = (req.query as { path?: string }).path ?? "";
    if (!normalizeRel(rel)) {
      return reply.code(400).send({ error: "impossible de supprimer la racine" });
    }
    try {
      const abs = resolveExistingInsideRoot(rel, libraryRootFor(req.user));
      await rm(abs, { recursive: true, force: false });
      return reply.code(204).send();
    } catch (err) {
      return handleError(reply, err);
    }
    },
  );

  // Stream a media file with HTTP Range support (powers the in-app player).
  // Range = only the requested byte window is read from disk → cheap, seekable,
  // no transcoding.
  app.get("/api/files/stream", async (req, reply) => {
    const rel = (req.query as { path?: string }).path ?? "";
    try {
      const abs = resolveExistingInsideRoot(rel, libraryRootFor(req.user));
      const s = await stat(abs);
      if (s.isDirectory()) {
        return reply.code(400).send({ error: "ce n'est pas un fichier" });
      }
      const type = mimeFor(basename(abs)) ?? "application/octet-stream";
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m?.[1] ? parseInt(m[1], 10) : 0;
        let end = m?.[2] ? parseInt(m[2], 10) : s.size - 1;
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end) || end >= s.size) end = s.size - 1;
        if (start > end || start >= s.size) {
          return reply
            .code(416)
            .header("Content-Range", `bytes */${s.size}`)
            .send();
        }
        return reply
          .code(206)
          .header("Content-Type", type)
          .header("Accept-Ranges", "bytes")
          .header("Content-Range", `bytes ${start}-${end}/${s.size}`)
          .header("Content-Length", end - start + 1)
          .send(createReadStream(abs, { start, end }));
      }
      return reply
        .code(200)
        .header("Content-Type", type)
        .header("Accept-Ranges", "bytes")
        .header("Content-Length", s.size)
        .send(createReadStream(abs));
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // Download a file (as attachment) or a whole folder (zipped on the fly).
  app.get("/api/files/download", async (req, reply) => {
    const rel = (req.query as { path?: string }).path ?? "";
    try {
      const abs = resolveExistingInsideRoot(rel, libraryRootFor(req.user));
      const s = await stat(abs);
      if (s.isDirectory()) {
        const zipName = `${basename(abs) || "library"}.zip`;
        reply
          .header("Content-Type", "application/zip")
          .header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
          );
        const archive = archiver("zip", { zlib: { level: 6 } });
        archive.on("error", (e) => reply.raw.destroy(e));
        archive.directory(abs, false);
        void archive.finalize();
        return reply.send(archive);
      }
      const name = basename(abs);
      return reply
        .header("Content-Type", mimeFor(name) ?? "application/octet-stream")
        .header("Content-Length", s.size)
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        )
        .send(createReadStream(abs));
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
