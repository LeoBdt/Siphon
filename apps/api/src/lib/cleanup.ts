import { readdir, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { CleanupResult } from "@app/shared";

/**
 * Delete stale yt-dlp temp artifacts (`.part`, `.ytdl`, fragment files) left
 * behind by interrupted downloads. Only files older than `maxAgeMs` are removed
 * so partials from a very recent crash — which the resumed job will `--continue`
 * — are preserved. Best-effort: individual failures are swallowed.
 */
export async function cleanStalePartials(
  rootDir: string,
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<CleanupResult> {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  let bytesFreed = 0;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (isTempArtifact(entry.name)) {
        try {
          const s = await stat(full);
          if (s.mtimeMs < cutoff) {
            await unlink(full);
            removed++;
            bytesFreed += s.size;
          }
        } catch {
          /* file vanished or is locked — skip */
        }
      }
    }
  }

  await walk(rootDir);
  return { removed, bytesFreed };
}

export function isTempArtifact(name: string): boolean {
  return (
    name.endsWith(".part") ||
    name.endsWith(".ytdl") ||
    /\.part-Frag\d+$/.test(name) ||
    name.endsWith(".temp.mp4") ||
    name.endsWith(".temp.mkv") ||
    // Un-merged DASH streams: yt-dlp downloads video and audio separately as
    // "<title> [id].f401.mp4" / ".f251.webm" and ffmpeg merges them into one
    // file. Both survive only when the merge never ran (process killed, ffmpeg
    // failure) — leaving a silent video and a stray audio file in the library.
    /\.f\d+\.[a-z0-9]{2,5}$/i.test(name)
  );
}

/**
 * Remove direct downloads nobody came to collect.
 *
 * A direct download exists only until its owner saves it; one that has sat in
 * scratch space for a day was abandoned, and keeping it would quietly turn the
 * "we do not keep a copy" promise into a lie.
 */
export async function cleanStaleDirect(
  tmpDir: string,
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  const root = join(tmpDir, "direct");
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = join(root, entry.name);
    try {
      const s = await stat(full);
      if (s.mtimeMs < cutoff) {
        await rm(full, { recursive: true, force: true });
        removed++;
      }
    } catch {
      /* vanished or locked — leave it for the next sweep */
    }
  }
  return removed;
}
