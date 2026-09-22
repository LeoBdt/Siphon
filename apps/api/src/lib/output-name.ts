import { readdir } from "node:fs/promises";

/**
 * Naming the file a download produces.
 *
 * yt-dlp used to be left to name it, with `%(title)s [%(id)s].%(ext)s`. The
 * bracketed id made every filename ugly for the sake of one thing: two videos
 * with the same title could not collide. So the collision is handled here
 * instead, the way a file manager does it — `Title`, then `Title (2)` — and
 * the id disappears from the library.
 *
 * Files downloaded before this change keep their id; nothing renames them.
 */

/**
 * The longest stem we will produce, in characters.
 *
 * Well under the 255 *bytes* most filesystems allow, because a title in a
 * non-Latin script spends several bytes per character and the extension, the
 * " (2)" and yt-dlp's own temporary suffixes all have to fit too.
 */
const MAX_STEM = 120;

/** Characters no filesystem here will take, plus the ones that confuse paths. */
// eslint-disable-next-line no-control-regex
const ILLEGAL_RE = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * A title, turned into something a filesystem will accept.
 *
 * Deliberately conservative: this has to hold on macOS, Linux and Windows
 * alike, since the same library may be served from a container and read from
 * a mounted share.
 */
export function sanitizeStem(title: string): string {
  const cleaned = title
    .replace(ILLEGAL_RE, " ")
    .replace(/\s+/g, " ")
    // A leading dot hides the file; trailing dots and spaces are silently
    // dropped by Windows, which would make the name we recorded a lie.
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return cleaned.slice(0, MAX_STEM).trim();
}

/**
 * Stems handed out for downloads that are still running.
 *
 * The finished file only appears in the destination when yt-dlp moves it there
 * — everything before that is written to scratch space — so the directory
 * listing cannot tell us that a name is already spoken for. Two entries of the
 * same playlist bearing the same title would otherwise both be promised it.
 */
const reserved = new Set<string>();

function key(destDir: string, stem: string): string {
  return `${destDir}\u0000${stem.toLowerCase()}`;
}

export interface ReservedStem {
  /** The name to give yt-dlp, without extension. */
  stem: string;
  /** Call once the download has settled, whatever the outcome. */
  release: () => void;
}

/**
 * Claim a free name for a download about to start.
 *
 * Looks at what the folder already holds and at what other downloads have
 * claimed, then counts up until it finds a name nobody is using. Matching
 * ignores the extension, so a `.mp4` does not quietly take the place of the
 * `.m4a` someone already has.
 */
export async function reserveOutputStem(
  destDir: string,
  title: string | null,
  fallback: string,
): Promise<ReservedStem> {
  const base = sanitizeStem(title ?? "") || sanitizeStem(fallback) || "download";

  let taken = new Set<string>();
  try {
    const names = await readdir(destDir);
    taken = new Set(
      names.map((n) => n.replace(/\.[^.]+$/, "").toLowerCase()),
    );
  } catch {
    // The folder may not exist yet — it is created just before the download
    // starts. Nothing in it can collide with anything.
  }

  let stem = base;
  let n = 1;
  while (taken.has(stem.toLowerCase()) || reserved.has(key(destDir, stem))) {
    n += 1;
    stem = `${base} (${n})`;
  }
  const k = key(destDir, stem);
  reserved.add(k);
  return { stem, release: () => reserved.delete(k) };
}
