import type { DownloadErrorCode, DownloadPhase } from "@app/shared";

/**
 * Pure parsers for the machine-readable lines yt-dlp emits via our
 * --progress-template / --print prefixes, plus a classifier that turns raw
 * yt-dlp stderr into a stable error code. Kept dependency-free (types only) so
 * they can be unit-tested without spawning a subprocess.
 */

export const PROGRESS_PREFIX = "[[PROG]]";
export const POST_PREFIX = "[[POST]]";
export const FILE_PREFIX = "[[FILE]]";

/** Parse a yt-dlp numeric field; "NA"/empty → null. */
export function num(s: string): number | null {
  if (!s || s === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Infer the download phase from the current stream's codecs. */
export function phaseFromCodecs(vcodec: string, acodec: string): DownloadPhase {
  const hasV = vcodec && vcodec !== "none" && vcodec !== "NA";
  const hasA = acodec && acodec !== "none" && acodec !== "NA";
  if (hasV) return "downloading-video";
  if (hasA) return "downloading-audio";
  return "downloading-video";
}

export interface ParsedProgress {
  progress: number | null;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
  phase: DownloadPhase;
  /** Bytes written so far for the current stream. */
  downloadedBytes: number | null;
  /**
   * What the current stream will weigh, measured or estimated by yt-dlp.
   *
   * Reported rather than folded into `progress` because it is the only
   * trustworthy size there is while a download runs: a per-account size limit
   * is enforced against this, not against the guess made before starting.
   */
  totalBytes: number | null;
}

/**
 * Parse a `[[PROG]]dl;total;totalEst;speed;eta;vcodec;acodec` line.
 * Returns null if the line isn't a progress line.
 */
export function parseProgressLine(line: string): ParsedProgress | null {
  if (!line.startsWith(PROGRESS_PREFIX)) return null;
  const payload = line.slice(PROGRESS_PREFIX.length);
  const [dl, total, totalEst, speed, eta, vcodec, acodec] = payload.split(";");
  const downloaded = num(dl ?? "");
  const totalBytes = num(total ?? "") ?? num(totalEst ?? "");
  const progress =
    downloaded != null && totalBytes
      ? Math.min(1, downloaded / totalBytes)
      : null;
  return {
    progress,
    speedBytesPerSec: num(speed ?? ""),
    etaSeconds: num(eta ?? ""),
    phase: phaseFromCodecs(vcodec ?? "", acodec ?? ""),
    downloadedBytes: downloaded,
    totalBytes,
  };
}

/** Parse a `[[POST]]<postprocessor>` line into a processing phase, or null. */
export function parsePostprocessLine(line: string): DownloadPhase | null {
  if (!line.startsWith(POST_PREFIX)) return null;
  const pp = line.slice(POST_PREFIX.length).trim();
  return pp === "Merger" ? "merging" : "converting";
}

/** Parse a `[[FILE]]<path>` line into the output path, or null. */
export function parseFileLine(line: string): string | null {
  if (!line.startsWith(FILE_PREFIX)) return null;
  return line.slice(FILE_PREFIX.length).trim() || null;
}

/**
 * Classify raw yt-dlp stderr into a stable error code. The API stays
 * language-neutral: the web app maps these codes to translated text, so
 * switching the interface language also switches the error messages.
 *
 * `detail` carries the last error-ish line of stderr, shown when the code is
 * `unknown` and kept for diagnostics otherwise.
 */
export function classifyYtdlpError(stderr: string): {
  code: DownloadErrorCode;
  detail: string;
} {
  const s = (stderr ?? "").toLowerCase();

  const rules: [RegExp, DownloadErrorCode][] = [
    [/private video/, "private_video"],
    [
      /members[- ]only|join this channel|available to this channel's members/,
      "members_only",
    ],
    [
      /video unavailable|has been removed|no longer available|account.*(terminated|closed)|this video is not available/,
      "unavailable",
    ],
    [
      /confirm your age|age[- ]restricted|inappropriate for some users/,
      "age_restricted",
    ],
    [
      /available in your country|blocked it in your country|geo[- ]?restrict/,
      "geo_blocked",
    ],
    [/confirm you.?re not a bot|sign in to confirm you.?re not a bot/, "bot_check"],
    [
      /requested format.*not available|no video formats found|requested format is not available/,
      "no_format",
    ],
    [
      /urlopen error|timed out|connection (reset|refused|aborted)|network is unreachable|getaddrinfo|temporary failure in name resolution/,
      "network",
    ],
    [/ffmpeg.*(not found|introuvable)|ffmpeg is not installed/, "ffmpeg_missing"],
  ];

  const lines = (stderr ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const errLine = [...lines].reverse().find((l) => /error/i.test(l));
  const detail = (errLine ?? lines[lines.length - 1] ?? "").slice(0, 300);

  for (const [re, code] of rules) {
    if (re.test(s)) return { code, detail };
  }
  return { code: "unknown", detail };
}
