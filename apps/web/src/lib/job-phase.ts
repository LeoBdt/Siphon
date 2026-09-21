import type { DownloadJob, DownloadStatus } from "@app/shared";
import type { Dictionary } from "@/lib/i18n";

/** Statuses where the job is still on its way somewhere. */
export const ACTIVE_STATUSES: DownloadStatus[] = [
  "queued",
  "fetching-info",
  "downloading",
  "processing",
];

/**
 * What a job is doing right now, in one phrase.
 *
 * Shared by the job card and the file manager tile: the tile used to say
 * "Downloading" for the whole run, so a long conversion — the phase where
 * nothing appears to move and people start wondering — was reported as a
 * download that had stalled.
 */
export function phaseLabel(job: DownloadJob, t: Dictionary): string {
  switch (job.status) {
    case "queued":
      return t.job.queued;
    case "fetching-info":
      return t.job.analyzing;
    case "downloading":
      return job.phase === "downloading-audio"
        ? t.job.downloadingAudio
        : t.job.downloadingVideo;
    case "processing":
      return job.phase === "merging" ? t.job.merging : t.job.converting;
    case "completed":
      return t.job.completed;
    case "error":
      return t.job.failed;
    case "canceled":
      return t.job.canceled;
  }
}
