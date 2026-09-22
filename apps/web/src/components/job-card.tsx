"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  ListVideo,
  RotateCw,
  Trash2,
  User as UserIcon,
  XCircle,
} from "lucide-react";
import type { DownloadJob, DownloadStatus } from "@app/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DotProgress } from "@/components/ui/dot-progress";
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatRelative,
  formatSpeed,
} from "@/lib/format";
import { useDeleteJob, useJobAction, useJobChildren } from "@/lib/hooks";
import { apiUrl } from "@/lib/api";
import { useI18n } from "@/components/i18n-provider";
import type { Dictionary } from "@/lib/i18n";
import { ACTIVE_STATUSES, phaseLabel } from "@/lib/job-phase";
import { EASE_OUT, DUR } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ACTIVE = ACTIVE_STATUSES;

/**
 * Which entries of a playlist did not make it.
 *
 * A count alone ends the conversation at "three of them failed" — the next
 * question is always which three, and until now the answer was nowhere in the
 * interface. Fetched only when unfolded: the listing carries the tally, and
 * this is asked of one playlist at a time.
 */
function FailedEntries({ job }: { job: DownloadJob }) {
  const { t, intl } = useI18n();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useJobChildren(job.id, open);
  const failed = (data ?? []).filter(
    (c) => c.status === "error" || c.status === "canceled",
  );

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
        {open ? t.job.hideFailed : t.job.showFailed}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            {isLoading ? (
              <Loader2 className="mt-1.5 size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1 border-l-2 border-destructive/30 pl-2">
                {failed.map((entry) => (
                  <li key={entry.id} className="text-xs">
                    <span className="block truncate" title={entry.title ?? entry.url}>
                      {entry.title ?? entry.url}
                    </span>
                    <span
                      className="text-destructive"
                      title={entry.errorMessage ?? undefined}
                    >
                      {entry.status === "canceled"
                        ? t.job.canceled
                        : entry.errorCode
                          ? t.errors[entry.errorCode]
                          : t.job.noFailureDetail}
                    </span>
                    <span className="ml-1.5 text-muted-foreground">
                      · {formatRelative(entry.updatedAt, intl)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 0 = download, 1 = processing, 2 = done. -1 for not-started/failed. */
function stepIndex(status: DownloadStatus): number {
  if (status === "downloading") return 0;
  if (status === "processing") return 1;
  if (status === "completed") return 2;
  return -1;
}

function Stepper({ job, t }: { job: DownloadJob; t: Dictionary }) {
  const current = stepIndex(job.status);
  const steps = [t.job.steps.download, t.job.steps.process, t.job.steps.done];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((label, i) => {
        const done = current > i || job.status === "completed";
        const active = current === i;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-medium transition-colors duration-300",
                done
                  ? "text-emerald-500"
                  : active
                    ? "text-primary"
                    : "text-muted-foreground/50",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors duration-300",
                  done
                    ? "bg-emerald-500"
                    : active
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                )}
              />
              {label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-px w-4 transition-colors duration-300",
                  current > i ? "bg-emerald-500/50" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function JobCard({
  job,
  /**
   * Whose download this is. Passed only when the list holds more than one
   * person's jobs, so an ordinary member never sees a badge naming themselves
   * on every row.
   */
  authorName,
}: {
  job: DownloadJob;
  authorName?: string | null;
}) {
  const { t, intl } = useI18n();
  const action = useJobAction();
  const del = useDeleteJob();

  const isActive = ACTIVE.includes(job.status);
  const pct = Math.round(job.progress * 100);
  const isProcessing = job.status === "processing";
  const isDownloading = job.status === "downloading";

  /**
   * A playlist that finished with entries missing.
   *
   * Its own state, because neither of the two it sits between is true: the
   * batch did run to the end, so calling it a failure would say the whole
   * download was lost — and a plain green tick would hide that three videos
   * are not there.
   */
  const partial =
    job.isPlaylistParent &&
    job.status === "completed" &&
    (job.failedCount ?? 0) > 0;

  const statusColor =
    job.status === "completed"
      ? partial
        ? "text-amber-500"
        : "text-emerald-500"
      : job.status === "error"
        ? "text-destructive"
        : job.status === "canceled"
          ? "text-muted-foreground"
          : "text-primary";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: DUR.panel, ease: EASE_OUT }}
      className="flex gap-3 rounded-xl border bg-card p-3"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video h-16 shrink-0 overflow-hidden rounded-md bg-muted">
        {job.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ListVideo className="size-5 text-muted-foreground" />
          </div>
        )}
        {(isProcessing || isDownloading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
            {isProcessing ? (
              <DotProgress indeterminate columns={5} rows={5} />
            ) : (
              <DotProgress progress={job.progress} columns={5} rows={5} />
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium" title={job.title ?? job.url}>
            {job.title ?? job.url}
          </p>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 text-xs font-medium",
              statusColor,
            )}
          >
            {/*
              A finished job carries a mark and a date: the mark says how it
              went at a glance, the date says when — which is what a history is
              read for. The word "Done" said neither.
            */}
            {job.status === "completed" ? (
              <>
                {partial ? (
                  <AlertTriangle className="size-3.5" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                {partial && t.job.partial(job.failedCount ?? 0)}
                <span className="font-normal text-muted-foreground">
                  {formatRelative(job.updatedAt, intl)}
                </span>
              </>
            ) : job.status === "error" ? (
              <XCircle className="size-3.5" />
            ) : job.status === "canceled" ? (
              <Ban className="size-3.5" />
            ) : job.status === "queued" ? (
              <Clock className="size-3.5" />
            ) : (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {job.status !== "completed" && phaseLabel(job, t)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {job.isPlaylistParent && (
            // While it runs, the useful number is how far along it is; once it
            // is over, how many there were. A playlist that says "40 videos"
            // for twenty minutes tells you nothing you did not already know.
            <Badge variant="secondary" className="gap-1 text-xs">
              <ListVideo className="size-3" />
              {isActive
                ? t.job.entriesDone(job.completedCount ?? 0, job.childCount ?? 0)
                : t.job.videos(job.childCount ?? 0)}
            </Badge>
          )}
          {job.isPlaylistParent && (job.failedCount ?? 0) > 0 && (
            <Badge
              variant="outline"
              className="gap-1 border-destructive/40 text-xs font-normal text-destructive"
            >
              <XCircle className="size-3" />
              {t.job.failedEntries(job.failedCount ?? 0)}
            </Badge>
          )}
          {authorName && (
            <Badge variant="outline" className="gap-1 text-xs font-normal">
              <UserIcon className="size-3" />
              {authorName}
            </Badge>
          )}
          <span className="uppercase">{job.preset}</span>
          {job.durationSeconds != null && (
            <span>· {formatDuration(job.durationSeconds)}</span>
          )}
          {job.fileSizeBytes != null && (
            <span>· {formatBytes(job.fileSizeBytes, intl)}</span>
          )}
        </div>

        {/* Stepper for active jobs */}
        {isActive && job.status !== "queued" && job.status !== "fetching-info" && (
          <div className="mt-1">
            <Stepper job={job} t={t} />
          </div>
        )}

        {/* Progress bar (download phase, determinate) */}
        {isDownloading && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>
        )}

        {isDownloading && (
          // The row stays mounted for the whole download and reserves its own
          // height, so the card never reflows while waiting for the first
          // reading. `tabular-nums` keeps the digits from jittering the width.
          <div className="flex h-4 items-center gap-3 text-xs tabular-nums text-muted-foreground">
            {job.speedBytesPerSec ? (
              <span>{formatSpeed(job.speedBytesPerSec, intl)}</span>
            ) : null}
            {job.etaSeconds ? (
              <span>
                {t.job.eta} {formatEta(job.etaSeconds)}
              </span>
            ) : null}
          </div>
        )}

        {job.status === "completed" && job.retention === "direct" && (
          // The server is holding this only until it is collected, so the
          // action belongs right here rather than in the file manager — which
          // will never show it.
          <div className="mt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const a = document.createElement("a");
                a.href = apiUrl(`/api/downloads/${job.id}/file`);
                a.rel = "noopener";
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
            >
              <Download className="size-4" />
              {t.download.save}
            </Button>
          </div>
        )}

        {job.status === "error" && (
          <p
            className="line-clamp-2 text-xs text-destructive"
            // The raw yt-dlp line stays available on hover for diagnostics.
            title={job.errorMessage ?? undefined}
          >
            {t.errors[job.errorCode ?? "unknown"]}
          </p>
        )}

        {job.isPlaylistParent && (job.failedCount ?? 0) > 0 && (
          <FailedEntries job={job} />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col justify-center gap-1">
        {isActive && (
          <Button
            size="icon-sm"
            variant="ghost"
            title={t.job.actions.cancel}
            onClick={() => action.mutate({ id: job.id, action: "cancel" })}
          >
            <Ban className="size-4" />
          </Button>
        )}
        {(job.status === "error" || job.status === "canceled") && (
          <Button
            size="icon-sm"
            variant="ghost"
            title={t.job.actions.retry}
            onClick={() => action.mutate({ id: job.id, action: "retry" })}
          >
            <RotateCw className="size-4" />
          </Button>
        )}
        {/*
          Hidden while the job runs: deleting it would cancel the download and
          take the card away, leaving no way to follow what was in flight.
          Cancel is the action on offer until it settles.
        */}
        {!isActive && (
          <Button
            size="icon-sm"
            variant="ghost"
            title={t.job.actions.remove}
            onClick={() => del.mutate(job.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
