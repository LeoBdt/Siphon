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
import { rm } from "node:fs/promises";
import type { Permissions } from "@app/shared";
import { config } from "./config.js";
import { dirUsage } from "./lib/dir-size.js";
import { checkBeforeDownload, checkWhileRunning, selectionFor } from "./lib/limits.js";
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
import { reserveOutputStem } from "./lib/output-name.js";
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

/**
 * Jobs stopped by a size or quota limit, and why.
 *
 * Held apart from `canceled` although both kill the process: one is a decision
 * the person made, the other is one made for them, and the history has to be
 * able to tell them apart.
 */
const overLimit = new Map<string, "file_too_large" | "quota_exceeded">();

/**
 * A download refused before it started, because of this account's limits.
 *
 * Carries the numbers rather than a sentence: the interface writes the
 * message, in the language it is set to, and needs the figures to say "2.3 GB,
 * your limit is 1 GB" instead of something vague.
 */
export class LimitError extends Error {
  constructor(
    readonly code: "file_too_large" | "quota_exceeded",
    readonly limitBytes: number,
    readonly estimatedBytes: number | null,
    /**
     * Whether going ahead anyway is on offer.
     *
     * True only when the verdict rested on an estimate. A size yt-dlp
     * measured is not a matter of opinion, and a button that starts a
     * download the server kills moments later is not a choice.
     */
    readonly overridable: boolean,
  ) {
    super(code);
    this.name = "LimitError";
  }
}

function emit(job: DownloadJob | null) {
  if (job) jobEvents.emitUpdate(job);
}

/**
 * The limits applying to whoever started a job, and what their folder already
 * holds.
 *
 * Null when nothing constrains them, so the hot path — a progress line, five
 * times a second — does no work at all in the common case. The disk figure is
 * the one taken when the download starts: a file added in the meantime is
 * caught by the next download rather than by re-walking the tree constantly.
 */
async function limitsFor(
  userId: string | null,
): Promise<{ permissions: Permissions; usedBytes: number } | null> {
  if (!userId) return null;
  const user = getUser(userId);
  if (!user) return null;
  const { maxFileSizeBytes, quotaBytes } = user.effective;
  if (maxFileSizeBytes == null && quotaBytes == null) return null;
  // Only worth measuring when a quota actually applies.
  const usedBytes =
    quotaBytes == null
      ? 0
      : (await dirUsage(join(config.rootDir, "users", user.libraryDir))).bytes;
  return { permissions: user.effective, usedBytes };
}

function youtubeThumb(id: string): string | null {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

// ---------------------------------------------------------------------------
// Running a single download
// ---------------------------------------------------------------------------

/**
 * A download stopped for breaking an account's limits.
 *
 * Distinct from a cancel: the person did not ask, so the job has to say what
 * happened and why — it lands in the history with a reason, rather than
 * looking like something they stopped themselves.
 */
function failForLimit(
  jobId: string,
  code: "file_too_large" | "quota_exceeded",
): void {
  overLimit.set(jobId, code);
  const handle = active.get(jobId);
  handle?.cancel();
  emit(
    updateJob(jobId, {
      status: "error",
      errorCode: code,
      errorMessage: null,
      speedBytesPerSec: null,
      etaSeconds: null,
      phase: null,
    }),
  );
  // Whatever was written so far is dead weight: nobody asked for a partial
  // file, and leaving it would count against the very quota that stopped it.
  void discardArtifacts(jobId);
}

/** Remove what a stopped download left behind, in scratch space and in place. */
async function discardArtifacts(jobId: string): Promise<void> {
  const job = getJob(jobId);
  await rm(join(config.tmpDir, "direct", jobId), {
    recursive: true,
    force: true,
  }).catch(() => {});
  if (job?.outputFile) {
    await rm(job.outputFile, { force: true }).catch(() => {});
  }
}

async function runJob(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job || job.status === "canceled") return;

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
  // Snapshot of what this account may do, taken once: re-reading it on every
  // progress line would mean a database round trip five times a second.
  const limits = await limitsFor(job.userId);
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

  // Claimed before yt-dlp starts, and held until this job settles: two entries
  // of one playlist can carry the same title, and the winner would otherwise
  // be decided by whichever finished moving its file first.
  const name = await reserveOutputStem(destDir, job.title, job.id);
  // Published straight away: the explorer sorts the in-progress tile by this,
  // so the tile sits where the finished file will, and turning one into the
  // other moves nothing.
  emit(updateJob(jobId, { plannedName: name.stem }));

  const handle = runDownload({
    url: job.url,
    preset: job.preset,
    advanced: fmt,
    destDir,
    outputStem: name.stem,
    onProgress: (p) => {
      // A cancelled job is settled. yt-dlp may still emit a line or two while
      // it is being torn down, and writing one through would put the card back
      // to "downloading" a moment after the user stopped it.
      if (canceled.has(jobId) || overLimit.has(jobId)) return;

      // The limits that actually enforce: these are measured bytes, not the
      // estimate the request was judged on before it started.
      if (limits) {
        const verdict = checkWhileRunning({
          permissions: limits.permissions,
          downloadedBytes: p.downloadedBytes ?? 0,
          totalBytes: p.totalBytes ?? null,
          usedBytesAtStart: limits.usedBytes,
        });
        if (verdict) {
          failForLimit(jobId, verdict);
          return;
        }
      }

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
      // Cancelled or stopped just as it finished: honour that rather than
      // announcing a file the user is not getting.
      if (canceled.has(jobId) || overLimit.has(jobId)) return;
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
      // Stopped by a limit: failForLimit already recorded why. The kill it
      // triggered arrives here as a cancellation, and letting that through
      // would replace the reason with "canceled".
      if (overLimit.has(jobId)) return;
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
      // Whatever the outcome: on success the file now holds the name itself,
      // and on failure nothing should keep it out of the next attempt's reach.
      name.release();
      active.delete(jobId);
      canceled.delete(jobId);
      overLimit.delete(jobId);
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

  const updated = updateJob(parentId, {
    status,
    progress,
    childCount: children.length,
  });
  // The tallies ride along with the update rather than waiting for the next
  // listing: the interface shows "12/40" and "3 failed" live, and a row read
  // straight from the table carries neither.
  emit(
    updated && {
      ...updated,
      completedCount: done,
      failedCount: errored + canceled,
    },
  );
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

  // Judged before anything is fetched. A playlist is probed flat, so there are
  // no formats to weigh — its children are each checked as they run.
  const limits = await limitsFor(userId);
  if (limits && !probe.info.isPlaylist) {
    const verdict = checkBeforeDownload({
      permissions: limits.permissions,
      formats: probe.formats,
      selection: selectionFor(req.preset, {
        maxHeight: maxHeight ?? null,
        maxFps: maxFps ?? null,
      }),
      usedBytes: limits.usedBytes,
    });
    // A warning is the caller's to act on: the estimate may be wrong, so the
    // interface says so and offers to go ahead. Sending the flag back is what
    // that consent looks like — and it cannot buy anything a measurement
    // already refused, since a refusal never becomes a warning.
    if (verdict.kind === "refused" || (verdict.kind === "warn" && !req.acceptEstimate)) {
      throw new LimitError(
        verdict.code,
        verdict.limit,
        verdict.estimated ?? null,
        verdict.kind === "warn",
      );
    }
  }

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
