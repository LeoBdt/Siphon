"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, Folder, Link2, ListVideo } from "lucide-react";
import type {
  AdvancedFormat,
  QualityPresetId,
  RetentionMode,
} from "@app/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FolderPicker } from "@/components/folder-picker";
import { JobCard } from "@/components/job-card";
import { QualitySelector } from "@/components/quality-selector";
import { PlaylistPicker } from "@/components/playlist-picker";
import { DotProgress } from "@/components/ui/dot-progress";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAuthState,
  useCreateDownload,
  useDownloads,
  useProbe,
} from "@/lib/hooks";
import { Segmented } from "@/components/ui/segmented";
import { formatDuration } from "@/lib/format";
import { DUR, EASE_OUT } from "@/lib/motion";
import { PAGE_COLUMN, cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { isRickRoll } from "@/lib/easter-eggs";

const YT_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i;

/**
 * Draft form values, parked in the React Query cache.
 *
 * This page unmounts when you navigate to Files or Settings, so a half-filled
 * form was lost on the way back. The query client is mounted above the pages
 * and already is the app's client-side store, so the draft rides along with it
 * for the life of the tab — no module-level mutable state, nothing on disk.
 */
const DRAFT_KEY = ["download-draft"] as const;

interface Draft {
  url: string;
  preset: QualityPresetId;
  dest: string;
}

const EMPTY_DRAFT: Draft = { url: "", preset: "best", dest: "" };

export default function DownloadPage() {
  const { t, errorMessage } = useI18n();
  const qc = useQueryClient();
  const saved = qc.getQueryData<Draft>(DRAFT_KEY) ?? EMPTY_DRAFT;

  const [url, setUrlState] = useState(saved.url);
  const [debouncedUrl, setDebouncedUrl] = useState(saved.url);
  const [preset, setPresetState] = useState<QualityPresetId>(saved.preset);
  const [advanced, setAdvanced] = useState<AdvancedFormat | null>(null);
  const [dest, setDestState] = useState(saved.dest);
  // Someone who may not keep files has no choice to make: the server puts them
  // on the direct path regardless, so offering the switch would only mislead.
  const { data: auth } = useAuthState();
  const canKeep = auth?.user?.effective.canKeepInLibrary ?? true;
  const [retention, setRetention] = useState<RetentionMode>("library");

  function keep(patch: Partial<Draft>) {
    qc.setQueryData<Draft>(DRAFT_KEY, (prev) => ({
      ...(prev ?? EMPTY_DRAFT),
      ...patch,
    }));
  }
  function setUrl(v: string) {
    keep({ url: v });
    setUrlState(v);
    // A different URL means a different playlist: forget the previous picks.
    setSelected(null);
  }
  function setPreset(v: QualityPresetId) {
    keep({ preset: v });
    setPresetState(v);
  }
  function setDest(v: string) {
    keep({ dest: v });
    setDestState(v);
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setSelected] = useState<Set<string> | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedUrl(url.trim()), 500);
    return () => clearTimeout(id);
  }, [url]);

  const validUrl = YT_URL_RE.test(debouncedUrl);
  const rickRolled = validUrl && isRickRoll(debouncedUrl);
  const probe = useProbe(debouncedUrl, validUrl);
  const create = useCreateDownload();
  // This page is personal for everyone, administrators included: you come here
  // to start your own download and follow it. Watching other people's jobs
  // scroll past would be noise, not information — supervision belongs in the
  // history, which is where the whole-instance view lives.
  const { data: jobs } = useDownloads("mine");

  const info = probe.data;
  const isPlaylist = !!info?.isPlaylist;
  const entries = useMemo(() => info?.entries ?? [], [info]);

  /**
   * Playlist entries start fully selected. Derived rather than written by an
   * effect when the probe resolves: `null` simply means "untouched", so there
   * is no second render pass and no window where a resolved playlist shows
   * nothing selected.
   */
  const selected = useMemo(
    () => picked ?? new Set(entries.map((e) => e.url)),
    [picked, entries],
  );

  // Keep finished jobs on screen briefly so the final state (done, errors)
  // is visible before the card animates out, instead of vanishing instantly.
  // `now` is a state clock (not Date.now() in render) so the memo stays pure.
  const RECENT_DONE_MS = 4000;
  const [now, setNow] = useState(() => Date.now());

  const activeCount = useMemo(
    () =>
      (jobs ?? []).filter((j) =>
        ["queued", "fetching-info", "downloading", "processing"].includes(
          j.status,
        ),
      ).length,
    [jobs],
  );

  const visibleJobs = useMemo(
    () =>
      (jobs ?? []).filter((j) => {
        if (
          ["queued", "fetching-info", "downloading", "processing"].includes(
            j.status,
          )
        ) {
          return true;
        }
        // Recently finished (completed / error / canceled) → hold for a moment.
        return now - new Date(j.updatedAt).getTime() < RECENT_DONE_MS;
      }),
    [jobs, now],
  );

  // While any finished job is still within its hold window, advance the clock on
  // a timer so held cards clear on schedule; self-stops once none remain.
  useEffect(() => {
    const hasHeld = (jobs ?? []).some(
      (j) =>
        ["completed", "error", "canceled"].includes(j.status) &&
        Date.now() - new Date(j.updatedAt).getTime() < RECENT_DONE_MS,
    );
    if (!hasHeld) return;
    const id = setTimeout(() => setNow(Date.now()), 500);
    return () => clearTimeout(id);
  }, [jobs, now]);

  const canSubmit =
    validUrl &&
    !create.isPending &&
    (!isPlaylist || selected.size > 0) &&
    !probe.isLoading;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        url: debouncedUrl,
        preset,
        destPath: dest,
        advanced,
        playlistItems: isPlaylist ? [...selected] : null,
        retention,
      });
      toast.success(
        isPlaylist ? t.download.startedMany(selected.size) : t.download.started,
      );
      setUrl("");
      setDebouncedUrl("");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className={cn(PAGE_COLUMN, "flex flex-col gap-6")}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.download.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.download.subtitle}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.download.cardTitle}</CardTitle>
          <CardDescription>{t.download.cardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <motion.div
            // Remounting on the flag replays the beat each time the classic is
            // pasted again. Reduced motion is neutralised globally in
            // globals.css, so this stays still for anyone who asked for that.
            key={rickRolled ? "rick" : "plain"}
            animate={
              rickRolled
                ? {
                    boxShadow: [
                      "0 0 0 0px var(--color-primary)",
                      "0 0 0 3px var(--color-primary)",
                      "0 0 0 0px var(--color-primary)",
                      "0 0 0 3px var(--color-primary)",
                      "0 0 0 0px var(--color-primary)",
                      "0 0 0 3px var(--color-primary)",
                      "0 0 0 0px var(--color-primary)",
                    ],
                  }
                : {}
            }
            transition={{ duration: 1.6, ease: "linear" }}
            className="relative rounded-lg"
          >
            <Link2 className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t.download.urlPlaceholder}
              className="h-11 pl-9"
            />
          </motion.div>

          {/* Preview / analysis — reveal instead of teleporting the layout. */}
          <AnimatePresence initial={false}>
            {validUrl && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border bg-muted/30 p-3">
              {probe.isLoading ? (
                <div className="flex items-center gap-3">
                  <DotProgress indeterminate columns={5} rows={5} />
                  <span className="text-sm text-muted-foreground">
                    {t.download.analyzing}
                  </span>
                </div>
              ) : probe.isError ? (
                <p className="text-sm text-destructive">
                  {t.download.probeFailed}
                </p>
              ) : info ? (
                <div className="flex gap-3">
                  {info.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={info.thumbnailUrl}
                      alt=""
                      className="aspect-video h-16 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{info.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {isPlaylist ? (
                        <Badge variant="secondary" className="gap-1">
                          <ListVideo className="size-3" />
                          {t.download.playlistBadge(info.entryCount ?? 0)}
                        </Badge>
                      ) : (
                        <span>{formatDuration(info.durationSeconds)}</span>
                      )}
                      {info.uploader && <span>· {info.uploader}</span>}
                      {rickRolled && (
                        <Badge variant="secondary">{t.rick.badge}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Playlist selection */}
          {isPlaylist && entries.length > 0 && (
            <PlaylistPicker
              entries={entries}
              selected={selected}
              onChange={setSelected}
            />
          )}

          {/* Quality */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t.download.quality}</span>
            <QualitySelector
              preset={preset}
              advanced={advanced}
              onPreset={setPreset}
              onAdvanced={setAdvanced}
            />
          </div>

          {/* Retention — only worth showing to someone allowed to keep files. */}
          {canKeep && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t.download.retention}</span>
              <Segmented<RetentionMode>
                id="retention"
                ariaLabel={t.download.retention}
                value={retention}
                onChange={setRetention}
                options={[
                  { value: "library", label: t.download.retentionLibrary },
                  { value: "direct", label: t.download.retentionDirect },
                ]}
              />
              <p className="text-xs text-muted-foreground">
                {retention === "library"
                  ? t.download.retentionLibraryHint
                  : t.download.retentionDirectHint}
              </p>
            </div>
          )}

          {/* Destination — meaningless for a file that is never kept. */}
          {retention === "library" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t.download.destination}</span>
            <Button
              variant="outline"
              className="h-10 justify-start font-normal"
              onClick={() => setPickerOpen(true)}
            >
              <Folder className="size-4 text-muted-foreground" />
              {dest ? dest : t.download.root}
            </Button>
          </div>
          )}

          <Button
            size="lg"
            className="h-11"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {create.isPending ? (
              <DotProgress
                indeterminate
                columns={5}
                rows={5}
                className="gap-px"
                dotClassName="bg-primary-foreground/25 h-1 w-1"
                activeDotClassName="bg-primary-foreground"
              />
            ) : (
              <Download className="size-4" />
            )}
            {isPlaylist
              ? t.download.submitMany(selected.size)
              : rickRolled
                ? t.rick.button
                : t.download.submit}
          </Button>
        </CardContent>
      </Card>

      {/* Active downloads (+ briefly-held finished ones) */}
      {/*
        Two levels of animation, because two things can disappear. `popLayout`
        takes a removed card out of the flow at once so the others glide up
        instead of stuttering, `layout` on the wrapper animates the height it
        frees, and the outer AnimatePresence collapses the whole block when the
        last card goes — without it the section unmounted instantly and the
        page snapped upwards.
      */}
      <AnimatePresence initial={false}>
        {visibleJobs.length > 0 && (
          <motion.div
            key="active-jobs"
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.panel, ease: EASE_OUT }}
            className="flex flex-col gap-2 overflow-hidden"
          >
            <h2 className="text-sm font-medium text-muted-foreground">
              {activeCount > 0 ? t.download.active(activeCount) : t.download.done}
            </h2>
            <AnimatePresence initial={false} mode="popLayout">
              {visibleJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <FolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialPath={dest}
        onSelect={setDest}
      />
    </div>
  );
}
