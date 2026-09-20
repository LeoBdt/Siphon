/**
 * Human-friendly formatters shared across the UI.
 *
 * Anything locale-sensitive takes an explicit BCP 47 tag (from `useI18n().intl`)
 * rather than relying on the runtime default, so an English interface never
 * renders French-formatted numbers or dates.
 */

const BYTE_UNITS: Record<string, string[]> = {
  fr: ["o", "Ko", "Mo", "Go", "To"],
  en: ["B", "KB", "MB", "GB", "TB"],
};

function unitsFor(intl: string): string[] {
  return BYTE_UNITS[intl.startsWith("fr") ? "fr" : "en"];
}

export function formatBytes(
  bytes: number | null | undefined,
  intl = "en-US",
): string {
  const units = unitsFor(intl);
  if (bytes == null) return "—";
  if (bytes === 0) return `0 ${units[0]}`;
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  const digits = value >= 10 || i === 0 ? 0 : 1;
  return `${value.toLocaleString(intl, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${units[i]}`;
}

/** Clock-style duration (m:ss / h:mm:ss) — identical in both locales. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatSpeed(
  bytesPerSec: number | null | undefined,
  intl = "en-US",
): string {
  if (!bytesPerSec) return "";
  return `${formatBytes(bytesPerSec, intl)}/s`;
}

export function formatDate(iso: string, intl = "en-US"): string {
  return new Date(iso).toLocaleString(intl, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
