import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  AdvancedFormat,
  DownloadPhase,
  QualityPresetId,
  VideoInfo,
  VideoInfoEntry,
} from "@app/shared";
import { QUALITY_PRESETS } from "@app/shared";
import { config } from "../config.js";
import {
  FILE_PREFIX,
  POST_PREFIX,
  PROGRESS_PREFIX,
  parseFileLine,
  parsePostprocessLine,
  parseProgressLine,
} from "./ytdlp-parse.js";

/**
 * Thin wrapper around the yt-dlp CLI. We drive it as a subprocess and parse a
 * machine-readable progress line emitted via --progress-template, including the
 * codecs of the current stream so we can surface a phase (video/audio/merge).
 * The pure line parsers live in ./ytdlp-parse.ts (unit-tested).
 */

/** Build the yt-dlp -f format selector for a given height/fps cap. */
function videoFormatSelector(
  maxHeight: number | null,
  maxFps: number | null,
): string {
  let f = "";
  if (maxHeight) f += `[height<=${maxHeight}]`;
  if (maxFps) f += `[fps<=${maxFps}]`;
  return `bv*${f}+ba/b${f}`;
}

/** Map a UI preset (+ optional advanced overrides) to concrete yt-dlp args. */
export function presetToArgs(
  preset: QualityPresetId,
  advanced?: AdvancedFormat | null,
): string[] {
  const meta = QUALITY_PRESETS.find((p) => p.id === preset);

  if (meta?.kind === "audio") {
    switch (preset) {
      case "audio-mp3":
        // Always a re-encode: YouTube never serves MP3.
        return ["-x", "--audio-format", "mp3", "--audio-quality", "0"];
      case "audio-opus":
        // Prefer the WebM/Opus source so --audio-format is a no-op remux.
        return ["-f", "ba[ext=webm]/ba", "-x", "--audio-format", "opus"];
      case "audio-m4a":
      default:
        // Same idea with the AAC source (itag 140 on virtually every video):
        // picking it explicitly keeps the extraction lossless.
        return ["-f", "ba[ext=m4a]/ba", "-x", "--audio-format", "m4a"];
    }
  }

  const maxHeight = advanced?.maxHeight ?? meta?.maxHeight ?? null;
  const maxFps = advanced?.maxFps ?? meta?.maxFps ?? null;
  return [
    "-f",
    videoFormatSelector(maxHeight, maxFps),
    "--merge-output-format",
    "mp4",
  ];
}

function baseArgs(): string[] {
  const args = ["--no-warnings"];
  if (config.ffmpegPath && config.ffmpegPath !== "ffmpeg") {
    args.push("--ffmpeg-location", config.ffmpegPath);
  }
  return args;
}

function spawnYtdlp(args: string[]): ChildProcessWithoutNullStreams {
  return spawn(config.ytdlpPath, args, {
    windowsHide: true,
    env: {
      ...process.env,
      // yt-dlp (Python) block-buffers its output when stdio is a pipe
      // (non-TTY), so progress lines only flush at the end.
      PYTHONUNBUFFERED: "1",
      // Python otherwise encodes stdout in the console's code page, while Node
      // decodes the pipe as UTF-8. Any non-ASCII character in a filename was
      // mangled on the way through — and yt-dlp puts them there routinely, as
      // it swaps characters that are illegal in a filename for lookalikes
      // (a "/" in a title becomes "⧸"). The recorded output path then no longer
      // matched the file actually on disk.
      PYTHONIOENCODING: "utf-8",
    },
  });
}

// ---------------------------------------------------------------------------
// Info probe
// ---------------------------------------------------------------------------

export interface ProbeResult {
  info: VideoInfo;
  entries: VideoInfoEntry[];
}

function youtubeThumb(id: string): string | null {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function pickThumbnail(data: Record<string, unknown>): string | null {
  if (typeof data.thumbnail === "string") return data.thumbnail;
  const thumbs = data.thumbnails as { url?: string }[] | undefined;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    return thumbs[thumbs.length - 1]?.url ?? null;
  }
  if (typeof data.id === "string") return youtubeThumb(data.id);
  return null;
}

function entryUrl(e: Record<string, unknown>): string {
  if (typeof e.url === "string" && e.url.startsWith("http")) return e.url;
  if (typeof e.webpage_url === "string") return e.webpage_url;
  if (typeof e.id === "string") return `https://www.youtube.com/watch?v=${e.id}`;
  return "";
}

export function probeInfo(url: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawnYtdlp([...baseArgs(), "-J", "--flat-playlist", url]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) =>
      reject(new Error(`yt-dlp not found or not executable: ${e.message}`)),
    );
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `yt-dlp failed (exit ${code})`));
        return;
      }
      try {
        const data = JSON.parse(out) as Record<string, unknown>;
        const isPlaylist =
          data._type === "playlist" || Array.isArray(data.entries);
        const rawEntries = (
          Array.isArray(data.entries) ? data.entries : []
        ) as Record<string, unknown>[];
        const entries: VideoInfoEntry[] = rawEntries
          .map((e) => ({
            url: entryUrl(e),
            title: (e.title as string) ?? "Untitled",
            id: (e.id as string) ?? "",
            durationSeconds: typeof e.duration === "number" ? e.duration : null,
            thumbnailUrl:
              pickThumbnail(e) ?? youtubeThumb((e.id as string) ?? ""),
          }))
          .filter((e) => e.url);
        const info: VideoInfo = {
          url,
          title: (data.title as string) ?? "Untitled",
          thumbnailUrl: pickThumbnail(data),
          durationSeconds:
            typeof data.duration === "number" ? data.duration : null,
          uploader:
            (data.uploader as string) ?? (data.channel as string) ?? null,
          isPlaylist,
          entryCount: isPlaylist ? entries.length : null,
          entries: isPlaylist ? entries : undefined,
        };
        resolve({ info, entries });
      } catch (e) {
        reject(new Error(`Unreadable yt-dlp output: ${(e as Error).message}`));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  progress: number | null;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
  phase: DownloadPhase;
}

export interface RunDownloadOptions {
  url: string;
  preset: QualityPresetId;
  advanced?: AdvancedFormat | null;
  destDir: string;
  onProgress?: (p: DownloadProgress) => void;
  onLog?: (line: string) => void;
}

export interface RunDownloadHandle {
  promise: Promise<{ outputFile: string | null }>;
  cancel: () => void;
}

// Matches ANSI/terminal control sequences (ESC [ ... final byte). Built via
// fromCharCode so the ESC char is unambiguous in source.
// eslint-disable-next-line no-control-regex
const ANSI_RE = new RegExp(
  String.fromCharCode(27) + "\\[[0-9;?]*[ -/]*[@-~]",
  "g",
);

export function runDownload(opts: RunDownloadOptions): RunDownloadHandle {
  const outTemplate = "%(title).200B [%(id)s].%(ext)s";
  const args = [
    ...baseArgs(),
    ...presetToArgs(opts.preset, opts.advanced),
    // Embed the video cover art + metadata into the output file.
    "--embed-thumbnail",
    "--embed-metadata",
    "--no-playlist",
    "--newline",
    "--no-simulate",
    // --print implies --quiet (hides the progress bar); --progress forces it
    // back on so our download progress-template still emits.
    "--progress",
    "--print",
    `after_move:${FILE_PREFIX}%(filepath)s`,
    "--progress-template",
    `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s;%(progress.total_bytes)s;%(progress.total_bytes_estimate)s;%(progress.speed)s;%(progress.eta)s;%(info.vcodec)s;%(info.acodec)s`,
    "--progress-template",
    `postprocess:${POST_PREFIX}%(progress.postprocessor)s`,
    "-o",
    outTemplate,
    "-P",
    opts.destDir,
    // Everything in flight — .part files, DASH fragments, and the thumbnail
    // fetched for --embed-thumbnail — is written to scratch space instead of
    // the library, so a download in progress never litters the file manager.
    // Only the finished file is moved into destDir.
    "-P",
    `temp:${config.tmpDir}`,
    opts.url,
  ];

  const child = spawnYtdlp(args);
  let outputFile: string | null = null;
  let stderrBuf = "";
  let killed = false;
  let lastEmit = 0;
  let lastPhase = "";

  function handleLine(rawLine: string) {
    const trimmed = rawLine.replace(ANSI_RE, "").trim();
    if (!trimmed) return;

    if (trimmed.startsWith(FILE_PREFIX)) {
      outputFile = parseFileLine(trimmed) ?? outputFile;
      return;
    }
    const postPhase = trimmed.startsWith(POST_PREFIX)
      ? parsePostprocessLine(trimmed)
      : null;
    if (postPhase) {
      opts.onProgress?.({
        progress: null,
        speedBytesPerSec: null,
        etaSeconds: null,
        phase: postPhase,
      });
      return;
    }
    const prog = parseProgressLine(trimmed);
    if (prog) {
      const now = Date.now();
      // Emit at most ~5x/s, but always on a phase change.
      if (prog.phase !== lastPhase || now - lastEmit >= 200) {
        lastEmit = now;
        lastPhase = prog.phase;
        opts.onProgress?.(prog);
      }
      return;
    }
    opts.onLog?.(trimmed);
  }

  function pump(chunk: string, bufRef: { buf: string }) {
    bufRef.buf += chunk;
    let idx: number;
    // yt-dlp refreshes progress with carriage returns (\r), not newlines, so we
    // treat BOTH as line terminators.
    while ((idx = bufRef.buf.search(/[\r\n]/)) >= 0) {
      const l = bufRef.buf.slice(0, idx);
      bufRef.buf = bufRef.buf.slice(idx + 1);
      handleLine(l);
    }
  }

  const stdoutRef = { buf: "" };
  const stderrRef = { buf: "" };
  child.stdout.on("data", (d) => pump(d.toString(), stdoutRef));
  child.stderr.on("data", (d) => {
    const s = d.toString();
    stderrBuf += s;
    if (stderrBuf.length > 8000) stderrBuf = stderrBuf.slice(-8000);
    pump(s, stderrRef);
  });

  const promise = new Promise<{ outputFile: string | null }>(
    (resolve, reject) => {
      child.on("error", (e) =>
        reject(new Error(`yt-dlp not found or not executable: ${e.message}`)),
      );
      child.on("close", (code) => {
        if (killed) {
          reject(new Error("__CANCELED__"));
          return;
        }
        if (code === 0) resolve({ outputFile });
        else
          reject(
            new Error(stderrBuf.trim() || `yt-dlp failed (exit ${code})`),
          );
      });
    },
  );

  return {
    promise,
    cancel: () => {
      killed = true;
      child.kill("SIGKILL");
    },
  };
}
