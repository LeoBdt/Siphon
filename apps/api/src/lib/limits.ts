import type { Permissions, QualityPresetId } from "@app/shared";
import { QUALITY_PRESETS } from "@app/shared";
import { estimateBytes, type FormatSummary } from "./size-estimate.js";

/**
 * Per-account size and quota limits.
 *
 * Two different questions, kept apart because they behave differently when the
 * answer is uncertain:
 *
 *   - **Size of one download.** Only estimated before it starts, so a limit is
 *     enforced up front *only* when yt-dlp measured the formats exactly.
 *     Otherwise the interface warns and the person may go ahead; the progress
 *     lines carry the real total and stop it if it truly exceeds.
 *   - **Storage quota.** Nothing uncertain about it: the folder is on disk and
 *     can be measured. There is no "go ahead anyway", because the problem is
 *     not a guess — it is the space that is already taken.
 */

export type LimitVerdict =
  | { kind: "ok" }
  /** Certainly over: refuse, and say by how much. */
  | { kind: "refused"; code: "file_too_large" | "quota_exceeded"; limit: number; estimated: number | null }
  /** Probably over, on an estimate: worth a warning, not a refusal. */
  | { kind: "warn"; code: "file_too_large" | "quota_exceeded"; limit: number; estimated: number };

/** What a preset asks yt-dlp for, as the estimator needs it. */
export function selectionFor(
  preset: QualityPresetId,
  advanced?: { maxHeight: number | null; maxFps: number | null } | null,
): { audioOnly: boolean; maxHeight: number | null; maxFps: number | null } {
  const meta = QUALITY_PRESETS.find((p) => p.id === preset);
  // The retired 1080p60 preset still has to behave as recorded.
  const legacy = preset === "1080p60" ? { maxHeight: 1080, maxFps: 60 } : undefined;
  return {
    audioOnly: meta?.kind === "audio",
    maxHeight: advanced?.maxHeight ?? meta?.maxHeight ?? legacy?.maxHeight ?? null,
    maxFps: advanced?.maxFps ?? meta?.maxFps ?? legacy?.maxFps ?? null,
  };
}

/**
 * Judge a download against what this account may do, before it starts.
 *
 * `usedBytes` is what their folder already holds; it is only consulted when a
 * quota applies, so the caller can skip walking the disk otherwise.
 */
export function checkBeforeDownload(opts: {
  permissions: Pick<Permissions, "maxFileSizeBytes" | "quotaBytes">;
  formats: FormatSummary[];
  selection: { audioOnly: boolean; maxHeight: number | null; maxFps: number | null };
  usedBytes: number;
}): LimitVerdict {
  const { bytes, exact } = estimateBytes(opts.formats, opts.selection);
  const maxFile = opts.permissions.maxFileSizeBytes;
  const quota = opts.permissions.quotaBytes;

  if (maxFile != null && bytes != null && bytes > maxFile) {
    return exact
      ? { kind: "refused", code: "file_too_large", limit: maxFile, estimated: bytes }
      : { kind: "warn", code: "file_too_large", limit: maxFile, estimated: bytes };
  }

  if (quota != null) {
    // Already full is already full, whatever this download turns out to weigh.
    if (opts.usedBytes >= quota) {
      return { kind: "refused", code: "quota_exceeded", limit: quota, estimated: bytes };
    }
    if (bytes != null && opts.usedBytes + bytes > quota) {
      return exact
        ? { kind: "refused", code: "quota_exceeded", limit: quota, estimated: bytes }
        : { kind: "warn", code: "quota_exceeded", limit: quota, estimated: bytes };
    }
  }

  return { kind: "ok" };
}

/**
 * Judge a download that is already running, from the sizes yt-dlp reports.
 *
 * This is the one that actually enforces: it works on measured bytes, so it
 * needs no estimate and cannot be argued with. Returns the code to fail the
 * job with, or null to let it continue.
 */
export function checkWhileRunning(opts: {
  permissions: Pick<Permissions, "maxFileSizeBytes" | "quotaBytes">;
  /** Bytes written so far for this download, across streams. */
  downloadedBytes: number;
  /** What the current stream is going to weigh, when yt-dlp says. */
  totalBytes: number | null;
  /** What their folder held when this download started. */
  usedBytesAtStart: number;
}): "file_too_large" | "quota_exceeded" | null {
  const { maxFileSizeBytes: maxFile, quotaBytes: quota } = opts.permissions;
  // The announced total counts as much as the bytes already written: there is
  // no reason to spend ten more minutes of bandwidth to arrive at a number we
  // are already told.
  const projected = Math.max(opts.downloadedBytes, opts.totalBytes ?? 0);

  if (maxFile != null && projected > maxFile) return "file_too_large";
  if (quota != null && opts.usedBytesAtStart + projected > quota) {
    return "quota_exceeded";
  }
  return null;
}
