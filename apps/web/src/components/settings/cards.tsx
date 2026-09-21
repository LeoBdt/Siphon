"use client";

import { useState } from "react";
import {
  ArrowUpCircle,
  CheckCircle2,
  HardDrive,
  Languages,
  Loader2,
  Palette,
  RefreshCw,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { YtdlpUpdateResult } from "@app/shared";
import { CONCURRENCY_MAX, CONCURRENCY_MIN } from "@app/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useI18n } from "@/components/i18n-provider";
import { Segmented } from "@/components/ui/segmented";
import {
  useAuthState,
  useCleanup,
  useDiskUsage,
  useSettings,
  useUpdateSettings,
  useReleaseCheck,
  useUpdateYtdlp,
  useYtdlpInfo,
} from "@/lib/hooks";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One card per settings concern. They live apart from the pages so a section
 * route stays a thin list of cards, and a card can be moved between sections
 * without being rewritten.
 */

const CONCURRENCY_OPTIONS = Array.from(
  { length: CONCURRENCY_MAX - CONCURRENCY_MIN + 1 },
  (_, i) => CONCURRENCY_MIN + i,
);

export function ThemeCard() {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4 text-primary" />
          {t.settings.theme.title}
        </CardTitle>
        <CardDescription>{t.settings.theme.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeSwitcher />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function LanguageCard() {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-4 text-primary" />
          {t.settings.language.title}
        </CardTitle>
        <CardDescription>{t.settings.language.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <LanguageSwitcher />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Whether this visitor may act on the engine.
 *
 * The navigation already hides these sections, and the server refuses the
 * calls — but a route is still reachable by typing its address, and a card
 * full of controls that all answer 403 is worse than no card.
 */
function useCanManageEngine(): boolean {
  const { data } = useAuthState();
  return Boolean(data?.user?.effective.canManageEngine);
}

export function ConcurrencyCard() {
  const mayManage = useCanManageEngine();
  const { t, errorMessage } = useI18n();
  const { data, isLoading, isError, error, refetch } = useSettings();
  const update = useUpdateSettings();

  function onChange(v: string | null) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    update.mutate(
      { maxConcurrentDownloads: n },
      {
        onSuccess: (s) =>
          toast.success(t.settings.concurrency.saved(s.maxConcurrentDownloads)),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  // Controlled from the first render: Base UI treats `undefined` as
  // uncontrolled, so we use `null` (= no selection) while the query loads.
  const value = data ? String(data.maxConcurrentDownloads) : null;


  if (!mayManage) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="size-4 text-primary" />
          {t.settings.concurrency.title}
        </CardTitle>
        <CardDescription>{t.settings.concurrency.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          // Without this the select simply sat there empty, which looks like a
          // missing setting rather than a failed request.
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">{errorMessage(error)}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="size-4" />
              {t.common.retry}
            </Button>
          </div>
        ) : (
        <div className="flex items-center gap-3">
          <Select
            value={value}
            onValueChange={onChange}
            disabled={isLoading || update.isPending}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="…" />
            </SelectTrigger>
            <SelectContent>
              {CONCURRENCY_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {update.isPending && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function DiskCard() {
  const { t, intl } = useI18n();
  const { data, isLoading, isError } = useDiskUsage();
  const pct =
    data && data.totalBytes > 0
      ? Math.min(100, Math.round((data.usedBytes / data.totalBytes) * 100))
      : 0;
  const low = data ? data.freeBytes < 2 * 1024 ** 3 : false; // < 2 GB

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDrive className="size-4 text-primary" />
          {t.settings.disk.title}
        </CardTitle>
        <CardDescription>{t.settings.disk.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t.settings.disk.reading}
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground">
            {t.settings.disk.unavailable}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                  low ? "bg-destructive" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
              <span>
                {t.settings.disk.used(formatBytes(data.usedBytes, intl), pct)}
              </span>
              <span className={low ? "font-medium text-destructive" : ""}>
                {t.settings.disk.free(
                  formatBytes(data.freeBytes, intl),
                  formatBytes(data.totalBytes, intl),
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function CleanupCard() {
  const mayManage = useCanManageEngine();
  const { t, intl, errorMessage } = useI18n();
  const cleanup = useCleanup();

  function onCleanup() {
    cleanup.mutate(undefined, {
      onSuccess: ({ removed, bytesFreed }) =>
        removed === 0
          ? toast.success(t.settings.cleanup.nothing)
          : toast.success(
              t.settings.cleanup.done(removed, formatBytes(bytesFreed, intl)),
            ),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }


  if (!mayManage) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="size-4 text-primary" />
          {t.settings.cleanup.title}
        </CardTitle>
        <CardDescription>{t.settings.cleanup.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onCleanup} disabled={cleanup.isPending} variant="outline">
          {cleanup.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          {t.settings.cleanup.action}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * Whether a newer Siphon has been released.
 *
 * Nothing happens until the button is pressed: this is the only part of the
 * app that talks to anything outside the machine, and a self-hosted tool that
 * promises to keep to itself should not phone home because a page was opened.
 *
 * There is no "update now". A container cannot replace itself, so doing it
 * from here would mean handing the Docker socket to the web application —
 * root on the host, in exchange for saving one command. The command is shown
 * instead.
 */
export function UpdateCard() {
  const mayManage = useCanManageEngine();
  const { t, intl, errorMessage } = useI18n();
  const check = useReleaseCheck();
  const u = t.settings.update;
  const result = check.data;

  const message =
    result?.error === "no_releases"
      ? u.noReleases
      : result?.error === "rate_limited"
        ? u.rateLimited
        : result?.error === "unreachable"
          ? u.unreachable
          : null;


  if (!mayManage) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpCircle className="size-4 text-primary" />
          {u.title}
        </CardTitle>
        <CardDescription>{u.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{u.installed}</span>
          <span className="font-mono text-sm">
            {process.env.NEXT_PUBLIC_APP_VERSION ?? t.common.unknown}
          </span>
        </div>

        <div>
          <Button
            variant="outline"
            disabled={check.isPending}
            onClick={() =>
              check.mutate(undefined, {
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            {check.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {u.check}
          </Button>
        </div>

        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        {result && !result.error && !result.updateAvailable && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {u.upToDate}
          </p>
        )}

        {result?.updateAvailable && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              {u.available(result.latest ?? "")}
              {result.publishedAt && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {formatDate(result.publishedAt, intl)}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{u.howTo}</p>
            <code className="rounded-md bg-background px-2 py-1.5 text-xs">
              docker compose pull &amp;&amp; docker compose up -d
            </code>
            {result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs underline underline-offset-4"
              >
                {u.releaseNotes}
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/** Beyond this, an unchecked yt-dlp is worth mentioning. */
const YTDLP_STALE_DAYS = 14;

export function YtdlpCard() {
  const mayManage = useCanManageEngine();
  const { t, intl, errorMessage } = useI18n();
  const { data, isLoading } = useYtdlpInfo();
  const settings = useSettings();
  const saveSettings = useUpdateSettings();
  const update = useUpdateYtdlp();
  const [result, setResult] = useState<YtdlpUpdateResult | null>(null);
  const y = t.settings.ytdlp;

  // Snapshot at mount rather than Date.now() in render, which is impure and
  // would give a different answer on every pass. A fortnight threshold does
  // not care that the clock stopped when the page opened.
  const [mountedAt] = useState(() => Date.now());
  const autoOn = settings.data?.autoUpdateYtdlp ?? false;
  const stale =
    !autoOn &&
    !isLoading &&
    (!data?.lastCheckedAt ||
      mountedAt - new Date(data.lastCheckedAt).getTime() >
        YTDLP_STALE_DAYS * 86_400_000);

  function onUpdate() {
    setResult(null);
    update.mutate(undefined, {
      onSuccess: (res) => {
        setResult(res);
        if (res.ok) toast.success(t.settings.ytdlp.checked);
        else toast.error(t.settings.ytdlp.failed);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  /**
   * The outcome in one line.
   *
   * yt-dlp's own output says it in two ("Latest version: stable@…" then
   * "yt-dlp is up to date (stable@…)"), and you have to read to the end of the
   * second to learn that nothing happened. The server now decides the verdict
   * by comparing versions, so this is a phrase in the right language rather
   * than a program's prose.
   */
  const verdict =
    result?.status === "updated"
      ? {
          tone: "text-emerald-600 dark:text-emerald-400",
          text: y.updatedTo(result.previousVersion ?? "?", result.version ?? "?"),
        }
      : result?.status === "already-current"
        ? {
            tone: "text-emerald-600 dark:text-emerald-400",
            text: y.alreadyCurrent(result.version ?? "?"),
          }
        : result
          ? { tone: "text-destructive", text: y.failed }
          : null;


  if (!mayManage) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.ytdlp.title}</CardTitle>
        <CardDescription>{t.settings.ytdlp.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {t.settings.ytdlp.installed}
          </span>
          <span className="font-mono text-sm">
            {isLoading ? "…" : (data?.version ?? t.common.unknown)}
          </span>
        </div>
        {/* The API has always reported this; nothing rendered it, so the card
            could not answer the one question it exists for — whether the
            engine has been looked at recently. */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {t.settings.ytdlp.lastCheckLabel}
          </span>
          <span className="text-sm">
            {isLoading
              ? "…"
              : data?.lastCheckedAt
                ? t.settings.ytdlp.lastChecked(formatDate(data.lastCheckedAt, intl))
                : t.settings.ytdlp.neverChecked}
          </span>
        </div>
        {/* The automatic check has worked since it was written, but nothing
            rendered its switch, so there was no way to know it existed — let
            alone turn it off. Unlike the Siphon release check, this one is
            safe to run on a schedule: it updates the tool inside the running
            container, and a stale yt-dlp is the single most common reason
            downloads start failing. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm">{t.settings.ytdlp.auto}</span>
            <span className="text-xs text-muted-foreground">
              {t.settings.ytdlp.autoHint}
            </span>
          </div>
          <Segmented<"on" | "off">
            id="ytdlp-auto"
            ariaLabel={t.settings.ytdlp.auto}
            value={settings.data?.autoUpdateYtdlp ? "on" : "off"}
            onChange={(next) =>
              saveSettings.mutate(
                { autoUpdateYtdlp: next === "on" },
                { onError: (e) => toast.error(errorMessage(e)) },
              )
            }
            options={[
              { value: "on", label: t.settings.ytdlp.on },
              { value: "off", label: t.settings.ytdlp.off },
            ]}
          />
        </div>

        <div>
          <Button onClick={onUpdate} disabled={update.isPending} variant="outline">
            {update.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t.settings.ytdlp.action}
          </Button>
        </div>
        {/* With the automatic check on there is nothing to warn about — it
            updates rather than reports, so by the time anyone could be told,
            it is already done. Off, nothing watches the engine at all, and a
            stale yt-dlp fails quietly and confusingly: downloads simply stop
            working on one site. */}
        {stale && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {t.settings.ytdlp.stale}
          </p>
        )}

        {verdict && (
          <p className={cn("flex items-center gap-1.5 text-sm", verdict.tone)}>
            {result?.ok ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <XCircle className="size-4 shrink-0" />
            )}
            {verdict.text}
          </p>
        )}

        {/* yt-dlp's own words, kept for when something did go wrong — folded
            away, because they are not an answer to "did it update?". */}
        {result?.message && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              {y.rawOutput}
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg border bg-muted/40 p-3 whitespace-pre-wrap">
              {result.message}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
