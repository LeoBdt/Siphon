import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { statSync } from "node:fs";
import PQueue from "p-queue";
import type {
  CreateDownloadRequest,
  DownloadJob,
  QualityPresetId,
} from "@app/shared";
import {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  QUALITY_PRESETS,
} from "@app/shared";
import { config } from "./config.js";
import {
  deleteJob,
  getJob,
  getJobFormat,
  getSetting,
  insertJob,
  listChildren,
  listQueuedLeafJobs,
  setSetting,
  updateJob,
} from "./db.js";
import { jobEvents } from "./lib/events.js";
import { probeInfo, runDownload, type RunDownloadHandle } from "./lib/ytdlp.js";
import { classifyYtdlpError } from "./lib/ytdlp-parse.js";
import { resolveInsideRoot } from "./lib/paths.js";
import { libraryRootFor } from "./auth/scope.js";
import { getUser } from "./auth/store.js";

/**
 * Orchestrates downloads: probes URLs, creates job rows (single or a playlist
 * parent + children), runs them through a concurrency-limited queue, streams
 * progress via the event bus, and aggregates playlist parents from children.
 */

const queue = new PQueue({ concurrency: config.maxConcurrentDownloads });

// A persisted concurrency override (set from the Settings page) wins over the
// env default.
{
  const stored = Number(getSetting("maxConcurrentDownloads"));
  if (Number.isFinite(stored) && stored > 0) {
    queue.concurrency = Math.max(
      CONCURRENCY_MIN,
      Math.min(CONCURRENCY_MAX, Math.floor(stored)),
    );
  }
}

/** Active runners, keyed by jobId, so we can cancel in-flight downloads. */
const active = new Map<string, RunDownloadHandle>();

/**
 * Jobs the user has asked to stop, from the moment they ask.
 *
 * Killing yt-dlp is not instant — it has descendants to take down, and it may
 * emit a few more progress lines on the way out. This set is what makes cancel
 * take effect at the click rather than whenever the process happens to die.
 */
const canceled = new Set<string>();

function emit(job: DownloadJob | null) {
  if (job) jobEvents.emitUpdate(job);
}

function youtubeThumb(id: string): string | null {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

// ---------------------------------------------------------------------------
// Running a single download
// ---------------------------------------------------------------------------

function runJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job || job.status === "canceled") return Promise.resolve();

  // Direct downloads land in scratch space under the job id: they are never
  // part of the library, and the folder is removed once the file is fetched
  // or the window expires.
  const destDir =
    job.retention === "direct"
      ? join(config.tmpDir, "direct", job.id)
      : // Resolved against the owner's root, so a job created by a confined
        // member writes inside their folder however the queue later runs it.
        resolveInsideRoot(job.destPath, libraryRootFor(job.userId));
  const fmt = getJobFormat(jobId);
  emit(
    updateJob(jobId, {
      status: "downloading",
      progress: 0,
      phase: "downloading-video",
      // Cleared explicitly: onProgress now carries the last known values
      // forward, and a retry must not inherit them from the failed attempt.
      speedBytesPerSec: null,
      etaSeconds: null,
    }),
  );

  const handle = runDownload({
    url: job.url,
    preset: job.preset,
    advanced: fmt,
    destDir,
    onProgress: (p) => {
      // A cancelled job is settled. yt-dlp may still emit a line or two while
      // it is being torn down, and writing one through would put the card back
      // to "downloading" a moment after the user stopped it.
      if (canceled.has(jobId)) return;
      const isProcessing = p.phase === "merging" || p.phase === "converting";
      if (isProcessing) {
        emit(updateJob(jobId, { status: "processing", phase: p.phase }));
        return;
      }
      // yt-dlp reports speed/eta as NA on the first lines of each stream and at
      // fragment boundaries. Writing those nulls through made the readout blink
      // out and back; hold the last known values until a real one arrives.
      const prev = getJob(jobId);
      emit(
        updateJob(jobId, {
          status: "downloading",
          progress: p.progress ?? prev?.progress ?? 0,
          speedBytesPerSec: p.speedBytesPerSec ?? prev?.speedBytesPerSec ?? null,
          etaSeconds: p.etaSeconds ?? prev?.etaSeconds ?? null,
          phase: p.phase,
        }),
      );
    },
    onLog: (line) => jobEvents.emitLog(jobId, line, job.userId ?? null),
  });
  active.set(jobId, handle);

  return handle.promise
    .then(({ outputFile }) => {
      // Cancelled just as it finished: honour the decision rather than
      // announcing a file the user stopped asking for.
      if (canceled.has(jobId)) return;
      let fileSizeBytes: number | null = null;
      if (outputFile) {
        try {
          fileSizeBytes = statSync(outputFile).size;
        } catch {
          /* file may have been moved; size is best-effort */
        }
      }
      emit(
        updateJob(jobId, {
          status: "completed",
          progress: 1,
          outputFile,
          fileSizeBytes,
          speedBytesPerSec: null,
          etaSeconds: null,
          phase: null,
        }),
      );
    })
    .catch((err: Error) => {
      if (err.message === "__CANCELED__" || canceled.has(jobId)) {
        // Already flipped to canceled when the user asked; this only clears
        // the readouts the card would otherwise keep showing.
        emit(
          updateJob(jobId, {
            status: "canceled",
            speedBytesPerSec: null,
            etaSeconds: null,
            phase: null,
          }),
        );
      } else {
        const { code, detail } = classifyYtdlpError(err.message);
        emit(
          updateJob(jobId, {
            status: "error",
            errorCode: code,
            errorMessage: detail || null,
            speedBytesPerSec: null,
            etaSeconds: null,
          }),
        );
      }
    })
    .finally(() => {
      active.delete(jobId);
      canceled.delete(jobId);
      const parentId = getJob(jobId)?.playlistId;
      if (parentId) recomputeParent(parentId);
    });
}

function enqueue(jobId: string) {
  void queue.add(() => runJob(jobId));
}

/** Re-enqueue jobs left `queued` after a crash/restart (see reconcileOnBoot). */
export function resumeInterruptedJobs(): number {
  const jobs = listQueuedLeafJobs();
  for (const job of jobs) enqueue(job.id);
  return jobs.length;
}

/** Current queue concurrency. */
export function getMaxConcurrent(): number {
  return queue.concurrency;
}

/** Change how many downloads run at once, live (clamped) + persist. */
export function setMaxConcurrent(n: number): number {
  const clamped = Math.max(
    CONCURRENCY_MIN,
    Math.min(CONCURRENCY_MAX, Math.floor(n)),
  );
  queue.concurrency = clamped;
  setSetting("maxConcurrentDownloads", String(clamped));
  return clamped;
}

/** How many downloads are running right now (used to guard the temp sweep). */
export function activeJobCount(): number {
  return active.size;
}

// ---------------------------------------------------------------------------
// Playlist parent aggregation
// ---------------------------------------------------------------------------

function recomputeParent(parentId: string) {
  const parent = getJob(parentId);
  if (!parent) return;
  const children = listChildren(parentId);
  if (children.length === 0) return;

  const done = children.filter((c) => c.status === "completed").length;
  const errored = children.filter((c) => c.status === "error").length;
  const canceled = children.filter((c) => c.status === "canceled").length;
  const finished = done + errored + canceled;
  const progress =
    children.reduce(
      (sum, c) => sum + (c.status === "completed" ? 1 : c.progress),
      0,
    ) / children.length;

  let status = parent.status;
  if (finished >= children.length) {
    status = errored > 0 && done === 0 ? "error" : "completed";
  } else if (children.some((c) => c.status === "downloading")) {
    status = "downloading";
  } else {
    status = "queued";
  }

  emit(updateJob(parentId, { status, progress, childCount: children.length }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createDownload(
  req: CreateDownloadRequest,
  /** Who is asking. Null only for jobs created before accounts existed. */
  userId: string | null = null,
  /** The caller's library root — their own folder, or the whole library. */
  libraryRoot: string = config.rootDir,
): Promise<DownloadJob> {
  const retention = req.retention ?? "library";
  // A direct download never lands in the library, so the destination is only
  // validated — and only meaningful — when it is being kept.
  if (retention === "library") resolveInsideRoot(req.destPath, libraryRoot);

  const maxHeight = req.advanced?.maxHeight ?? null;
  const maxFps = req.advanced?.maxFps ?? null;

  const probe = await probeInfo(req.url);

  if (probe.info.isPlaylist) {
    // Restrict to the selected entry URLs when the UI provided a selection.
    const selection = req.playlistItems?.length
      ? new Set(req.playlistItems)
      : null;
    const entries = selection
      ? probe.entries.filter((e) => selection.has(e.url))
      : probe.entries;

    const parentId = randomUUID();
    const parent = insertJob({
      id: parentId,
      url: req.url,
      title: probe.info.title,
      thumbnailUrl: probe.info.thumbnailUrl,
      durationSeconds: null,
      preset: req.preset,
      destPath: req.destPath,
      status: "queued",
      isPlaylistParent: true,
      childCount: entries.length,
      maxHeight,
      maxFps,
      retention,
      userId,
    });
    emit(parent);

    for (const entry of entries) {
      const childId = randomUUID();
      insertJob({
        id: childId,
        url: entry.url,
        title: entry.title,
        thumbnailUrl: entry.thumbnailUrl ?? youtubeThumb(entry.id),
        durationSeconds: entry.durationSeconds,
        preset: req.preset,
        destPath: req.destPath,
        status: "queued",
        playlistId: parentId,
        maxHeight,
        maxFps,
        retention,
        userId,
      });
      enqueue(childId);
    }
    return getJob(parentId)!;
  }

  // Single video
  const id = randomUUID();
  const job = insertJob({
    id,
    url: req.url,
    title: probe.info.title,
    thumbnailUrl: probe.info.thumbnailUrl,
    durationSeconds: probe.info.durationSeconds,
    preset: req.preset,
    destPath: req.destPath,
    status: "queued",
    maxHeight,
    maxFps,
    retention,
    userId,
  });
  emit(job);
  enqueue(id);
  return job;
}

export function cancelDownload(jobId: string): DownloadJob | null {
  const job = getJob(jobId);
  if (!job) return null;

  if (job.isPlaylistParent) {
    for (const child of listChildren(jobId)) cancelDownload(child.id);
    return getJob(jobId);
  }

  const handle = active.get(jobId);
  if (handle) {
    canceled.add(jobId);
    // Flipped here, not in the catch: tearing down yt-dlp and its ffmpeg takes
    // a moment, and a card that keeps counting up after the click reads as a
    // cancel that did not work.
    emit(
      updateJob(jobId, {
        status: "canceled",
        speedBytesPerSec: null,
        etaSeconds: null,
        phase: null,
      }),
    );
    handle.cancel();
  } else if (!["completed", "error", "canceled"].includes(job.status)) {
    // Queued, being probed, or left mid-flight by a restart: there is no
    // process to kill, but the queue must not pick it up later — runJob
    // checks the status before it starts.
    emit(updateJob(jobId, { status: "canceled" }));
  }
  return getJob(jobId);
}

export function retryDownload(jobId: string): DownloadJob | null {
  const job = getJob(jobId);
  if (!job) return null;

  if (job.isPlaylistParent) {
    for (const child of listChildren(jobId)) {
      if (["error", "canceled"].includes(child.status)) retryDownload(child.id);
    }
    return getJob(jobId);
  }

  if (["error", "canceled"].includes(job.status)) {
    emit(
      updateJob(jobId, {
        status: "queued",
        progress: 0,
        errorCode: null,
        errorMessage: null,
      }),
    );
    enqueue(jobId);
  }
  return getJob(jobId);
}

export function removeDownload(jobId: string): void {
  cancelDownload(jobId);
  deleteJob(jobId);
}

export function isPresetId(v: unknown): v is QualityPresetId {
  return typeof v === "string" && QUALITY_PRESETS.some((p) => p.id === v);
}
