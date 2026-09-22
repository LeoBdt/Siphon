import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { config } from "../config.js";

/**
 * Small preview images for the file explorer.
 *
 * Built with ffmpeg, which the deployment already ships for merging and
 * converting, so nothing new is installed for this. Three cases, one answer:
 * a frame from a video, the cover art embedded in an audio file, a scaled copy
 * of an image.
 *
 * Every result is cached on disk. A thumbnail costs an ffmpeg process, and a
 * folder of two hundred files would otherwise pay it on every visit — the
 * point of thumbnails is to make browsing pleasant, not to heat the server.
 */

/** Longest edge, in pixels. Twice the 56px tile, for high-density screens. */
const SIZE = 112;

/** How long ffmpeg gets before we give up on one file. */
const TIMEOUT_MS = 10_000;

const VIDEO_EXT = new Set([".mp4", ".mkv", ".webm", ".mov", ".avi"]);
const AUDIO_EXT = new Set([".mp3", ".m4a", ".opus", ".ogg", ".flac", ".wav"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Whether a preview can be made at all, judged by the extension. */
export function canThumbnail(name: string): boolean {
  const ext = extname(name).toLowerCase();
  return VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext) || IMAGE_EXT.has(ext);
}

function cacheDir(): string {
  return join(config.tmpDir, "thumbs");
}

/**
 * Where a file's thumbnail lives.
 *
 * Keyed by the path *and* what the file was when it was made: replace a file
 * and the key changes, so a stale preview can never be served for new content.
 * Hashed because the key would otherwise be a filename containing a path.
 */
function cachePath(abs: string, mtimeMs: number, size: number): string {
  const key = createHash("sha1")
    .update(`${abs}\u0000${Math.round(mtimeMs)}\u0000${size}`)
    .digest("hex");
  return join(cacheDir(), `${key}.jpg`);
}

function run(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(config.ffmpegPath, args, { stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/** Fit inside a square without distorting or upscaling. */
const SCALE = `scale='min(${SIZE},iw)':'min(${SIZE},ih)':force_original_aspect_ratio=decrease`;

/**
 * The thumbnail for one file, made if it does not exist yet.
 *
 * Returns null when there is nothing to show — an audio file with no cover
 * art, a video ffmpeg cannot read, a format we do not preview. The caller
 * answers 404 and the interface falls back to its icon, which is a perfectly
 * good answer and the one it used before thumbnails existed.
 */
export async function thumbnailFor(abs: string): Promise<string | null> {
  const ext = extname(abs).toLowerCase();
  if (!canThumbnail(abs)) return null;

  const s = await stat(abs).catch(() => null);
  if (!s || !s.isFile()) return null;

  const out = cachePath(abs, s.mtimeMs, s.size);
  if (await stat(out).then(() => true).catch(() => false)) return out;

  await mkdir(cacheDir(), { recursive: true });

  let ok = false;
  if (IMAGE_EXT.has(ext)) {
    ok = await run(["-y", "-i", abs, "-vf", SCALE, "-frames:v", "1", out]);
  } else if (AUDIO_EXT.has(ext)) {
    // The cover art embedded by --embed-thumbnail is a video stream inside the
    // container; -an drops the sound and leaves exactly that picture.
    ok = await run([
      "-y",
      "-i",
      abs,
      "-an",
      "-vf",
      SCALE,
      "-frames:v",
      "1",
      out,
    ]);
  } else {
    // Seek before opening the input, which is the fast form: ffmpeg jumps
    // straight to the keyframe instead of decoding its way there. Three
    // seconds in, because the first frame of a video is so often black.
    ok = await run([
      "-y",
      "-ss",
      "3",
      "-i",
      abs,
      "-vf",
      SCALE,
      "-frames:v",
      "1",
      out,
    ]);
    // A clip shorter than the seek yields nothing; try again from the start
    // rather than reporting that a three-second video has no preview.
    if (!ok) {
      ok = await run(["-y", "-i", abs, "-vf", SCALE, "-frames:v", "1", out]);
    }
  }

  if (!ok) return null;
  // ffmpeg exits 0 having written nothing when a stream it expected is
  // missing — an audio file with no cover art takes this path.
  const written = await stat(out).catch(() => null);
  return written && written.size > 0 ? out : null;
}
