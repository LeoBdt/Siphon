"use client";

import { useState } from "react";
import {
  HardDrive,
  Languages,
  Loader2,
  Palette,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  useCleanup,
  useDiskUsage,
  useSettings,
  useUpdateSettings,
  useUpdateYtdlp,
  useYtdlpInfo,
} from "@/lib/hooks";
import { formatBytes } from "@/lib/format";

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

export function ConcurrencyCard() {
  const { t, errorMessage } = useI18n();
  const { data, isLoading } = useSettings();
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

export function YtdlpCard() {
  const { t, errorMessage } = useI18n();
  const { data, isLoading } = useYtdlpInfo();
  const update = useUpdateYtdlp();
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  function onUpdate() {
    setLastMessage(null);
    update.mutate(undefined, {
      onSuccess: (res) => {
        setLastMessage(res.message);
        if (res.ok) toast.success(t.settings.ytdlp.checked);
        else toast.error(t.settings.ytdlp.failed);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

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
        {lastMessage && (
          <pre className="max-h-40 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {lastMessage}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
