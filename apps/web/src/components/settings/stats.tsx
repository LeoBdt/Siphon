"use client";

import { useState } from "react";
import { Activity, Download, HardDrive, Loader2 } from "lucide-react";
import type { UserStats } from "@app/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import { useMyStats } from "@/lib/hooks";
import { formatBytes, formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What this account has done, and what it is allowed.
 *
 * Its own section rather than a corner of the profile: a profile is who you
 * are, this is what you have used — and until now the figures existed only in
 * the administrator's view of somebody else.
 */
export function StatsTab() {
  const { t } = useI18n();
  const { data: stats, isLoading } = useMyStats();
  const s = t.settings.stats;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          {s.title}
        </CardTitle>
        <CardDescription>{s.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isLoading || !stats ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <Figures stats={stats} />
            <Allowances stats={stats} />
            <VolumeChart stats={stats} />
            <DailyChart stats={stats} />
            <PresetBreakdown stats={stats} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/**
 * The four numbers worth reading at a glance.
 *
 * "Downloaded" and "On disk" sit side by side on purpose: they disagree, and
 * they should. A file deleted afterwards was still downloaded, and running the
 * two together into one figure would be a number that answers neither
 * question.
 */
function Figures({ stats }: { stats: UserStats }) {
  const { t, intl } = useI18n();
  const u = t.settings.users;
  const s = t.settings.stats;

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Figure
        icon={<Download className="size-3.5" />}
        label={u.fetched}
        value={formatBytes(stats.bytesFetched, intl)}
      />
      <Figure
        icon={<HardDrive className="size-3.5" />}
        label={u.diskUsed}
        // Always a figure. "Whole library" was an answer to a different
        // question: for someone who browses everything, what they occupy is
        // the library, and the size of it is exactly what was being asked.
        value={formatBytes(stats.diskBytes, intl)}
        hint={
          stats.scoped
            ? s.fileCount(stats.fileCount)
            : `${u.wholeLibrary} · ${s.fileCount(stats.fileCount)}`
        }
      />
      <Figure
        label={u.downloadCount}
        value={String(stats.total)}
        hint={s.outcome(stats.completed, stats.failed)}
      />
      <Figure
        label={u.lastDownload}
        // Relative, because a full date and time did not fit the tile and was
        // being cut off mid-way — "22/09/26 23…" answers nothing.
        value={
          stats.lastDownloadAt
            ? formatRelative(stats.lastDownloadAt, intl)
            : u.never
        }
        title={
          stats.lastDownloadAt
            ? formatDate(stats.lastDownloadAt, intl)
            : undefined
        }
      />
    </dl>
  );
}

function Figure({
  icon,
  label,
  value,
  hint,
  title,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  /** The precise version of an abbreviated value, on hover. */
  title?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      {/* Tabular figures so a row of these does not jitter as they update. */}
      <dd className="truncate text-lg font-semibold tabular-nums" title={title}>
        {value}
      </dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allowances
// ---------------------------------------------------------------------------

/**
 * What this account may do, with a gauge only where one means something.
 *
 * Storage is the single limit you fill up gradually, so it is the only one
 * that gets a bar. A maximum file size and a number of simultaneous downloads
 * are thresholds, not budgets: a progress bar against them would be drawing a
 * quantity that does not accumulate.
 */
function Allowances({ stats }: { stats: UserStats }) {
  const { t, intl } = useI18n();
  const s = t.settings.stats;
  const u = t.settings.users;

  const quota = stats.quotaBytes;
  const used = stats.diskBytes;
  const ratio = quota ? Math.min(1, used / quota) : 0;
  // Three bands rather than a gradient: the colour is there to say "you are
  // close", which is a decision, not a measurement.
  const bar =
    ratio >= 0.95 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">{s.allowances}</h4>

      {quota != null ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{u.limits.quotaBytes}</span>
            <span className="tabular-nums text-muted-foreground">
              {s.ofQuota(formatBytes(used, intl), formatBytes(quota, intl))}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("h-full rounded-full transition-[width]", bar)}
              style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%` }}
            />
          </div>
        </div>
      ) : (
        <Allowance label={u.limits.quotaBytes} value={s.noLimit} />
      )}

      <Allowance
        label={u.limits.maxFileSizeBytes}
        value={
          stats.maxFileSizeBytes == null
            ? s.noLimit
            : formatBytes(stats.maxFileSizeBytes, intl)
        }
      />
      <Allowance
        label={u.limits.maxConcurrentDownloads}
        value={String(stats.maxConcurrentDownloads)}
        // Said plainly rather than left to be discovered: an account granted
        // more than the instance runs at once is not getting more.
        hint={stats.concurrencyCappedByInstance ? s.cappedByInstance : undefined}
      />
    </div>
  );
}

function Allowance({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span>
        {label}
        {hint && (
          <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
      <span className="tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 96;
/** Gap between bars, in the same units as the viewBox. */
const GAP = 2;

/**
 * Downloads per day over the last month.
 *
 * Inline SVG on the interface's own tokens rather than a charting library: one
 * series of thirty bars needs no runtime, and a library's palette would have
 * to be fought back into the theme in both light and dark. One series also
 * means no legend — the title names it — and no colour coding to misread.
 *
 * Every day is present, including the empty ones, because a chart that skips
 * quiet days draws a busier month than the one that happened.
 */
function DailyChart({ stats }: { stats: UserStats }) {
  const { t, intl } = useI18n();
  const s = t.settings.stats;
  const [hovered, setHovered] = useState<number | null>(null);

  const days = stats.daily;
  const peak = Math.max(1, ...days.map((d) => d.count));
  const width = days.length * 10;
  const barWidth = 10 - GAP;
  const active = hovered !== null ? days[hovered] : null;

  if (days.every((d) => d.count === 0)) {
    return (
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">{s.chartTitle}</h4>
        <p className="text-sm text-muted-foreground">{s.chartEmpty}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{s.chartTitle}</h4>
        {/* The reading for the day under the pointer, in text ink: the bar
            carries the identity, the words stay neutral. */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {active
            ? `${formatDate(`${active.date}T12:00:00Z`, intl).split(" ")[0]} · ${s.downloads(active.count)}`
            : s.peak(peak)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="h-24 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={s.chartTitle}
        onPointerLeave={() => setHovered(null)}
      >
        {days.map((day, i) => {
          const height = (day.count / peak) * (CHART_HEIGHT - 4);
          return (
            <g key={day.date}>
              {/* A full-height target, so a quiet day is as easy to hover as
                  a busy one — the bar itself would be a 2px sliver. */}
              <rect
                x={i * 10}
                y={0}
                width={10}
                height={CHART_HEIGHT}
                fill="transparent"
                onPointerEnter={() => setHovered(i)}
              />
              <rect
                x={i * 10}
                y={CHART_HEIGHT - Math.max(height, day.count > 0 ? 3 : 1)}
                width={barWidth}
                height={Math.max(height, day.count > 0 ? 3 : 1)}
                rx={1.5}
                className={cn(
                  "transition-colors",
                  day.count === 0
                    ? "fill-muted"
                    : hovered === i
                      ? "fill-primary"
                      : "fill-primary/70",
                )}
                pointerEvents="none"
              />
              <title>{`${day.date} · ${s.downloads(day.count)}`}</title>
            </g>
          );
        })}
      </svg>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{s.daysAgo(days.length)}</span>
        <span>{s.today}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume over time
// ---------------------------------------------------------------------------

/**
 * How the downloaded volume has built up over the month.
 *
 * Deliberately *downloaded*, not *occupied*: nothing records how much disk was
 * in use last Tuesday, and a curve that pretended to would drop every time a
 * file was deleted — except it cannot, because deletions are not recorded
 * either. This is the total fetched, which only ever rises, and the label
 * says so. A curve of real disk usage needs a daily snapshot kept from now on.
 *
 * An area under the line, because the quantity is an accumulation: the filled
 * region is the volume itself, not decoration.
 */
function VolumeChart({ stats }: { stats: UserStats }) {
  const { t, intl } = useI18n();
  const s = t.settings.stats;
  const [hovered, setHovered] = useState<number | null>(null);

  // Running total, so the curve answers "how much by then" rather than "how
  // much that day" — which is the bar chart below. Reduced rather than
  // accumulated into a variable: nothing outside this expression may see a
  // half-built total.
  const points = stats.daily.reduce<{ date: string; total: number }[]>(
    (acc, d) => [
      ...acc,
      { date: d.date, total: (acc[acc.length - 1]?.total ?? 0) + d.bytes },
    ],
    [],
  );
  const running = points[points.length - 1]?.total ?? 0;
  const peak = Math.max(1, running);
  const width = 300;
  const active = hovered !== null ? points[hovered] : null;

  if (running === 0) return null;

  const x = (i: number) => (i / Math.max(1, points.length - 1)) * width;
  const y = (v: number) => CHART_HEIGHT - (v / peak) * (CHART_HEIGHT - 6) - 3;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.total)}`).join(" ");
  const area = `${line} L${width},${CHART_HEIGHT} L0,${CHART_HEIGHT} Z`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{s.volumeTitle}</h4>
        <span className="text-xs tabular-nums text-muted-foreground">
          {active
            ? `${active.date} · ${formatBytes(active.total, intl)}`
            : formatBytes(running, intl)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        className="h-24 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={s.volumeTitle}
        onPointerLeave={() => setHovered(null)}
      >
        <path d={area} className="fill-primary/15" />
        <path
          d={line}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {active && hovered !== null && (
          <>
            <line
              x1={x(hovered)}
              x2={x(hovered)}
              y1={0}
              y2={CHART_HEIGHT}
              className="stroke-border"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/* A ring in the surface colour, so the marker reads as sitting on
                the line rather than as a hole in it. */}
            <circle
              cx={x(hovered)}
              cy={y(active.total)}
              r={4}
              className="fill-primary stroke-card"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={x(i) - width / points.length / 2}
            y={0}
            width={width / points.length}
            height={CHART_HEIGHT}
            fill="transparent"
            onPointerEnter={() => setHovered(i)}
          />
        ))}
      </svg>
      <p className="text-xs text-muted-foreground">{s.volumeHint}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakdown by quality
// ---------------------------------------------------------------------------

/**
 * Which qualities the library is actually made of.
 *
 * Horizontal bars rather than a pie: at five or six slices a pie is a puzzle,
 * and these want comparing, which is what a shared baseline is for. Sorted
 * heaviest first, so the row that explains the disk is the first one read.
 */
function PresetBreakdown({ stats }: { stats: UserStats }) {
  const { t, intl } = useI18n();
  const s = t.settings.stats;
  const rows = stats.byPreset.filter((p) => p.bytes > 0);
  if (rows.length === 0) return null;
  const peak = Math.max(...rows.map((r) => r.bytes));

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{s.presetTitle}</h4>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.preset} className="flex items-center gap-3 text-xs">
            <span className="w-24 shrink-0 truncate uppercase">
              {t.quality.presets[row.preset]?.label ?? row.preset}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.max((row.bytes / peak) * 100, 2)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
              {formatBytes(row.bytes, intl)}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
              {row.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
