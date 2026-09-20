import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface DirUsage {
  bytes: number;
  files: number;
  folders: number;
}

const EMPTY: DirUsage = { bytes: 0, files: 0, folders: 0 };

/**
 * Walk a folder and add up what it holds.
 *
 * Deliberately plain: no `du`, which is absent on Windows and would make the
 * answer depend on the host. Symlinks are counted by their own size rather
 * than followed — a link pointing back up the tree would otherwise loop
 * forever, and one pointing outside would bill a member for someone else's
 * bytes.
 *
 * A missing folder is zero, not an error: an account that has never
 * downloaded anything has no folder, and that is a perfectly good answer.
 */
export async function dirUsage(dir: string): Promise<DirUsage> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return EMPTY;
  }

  const usage: DirUsage = { bytes: 0, files: 0, folders: 0 };
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      usage.folders += 1;
      const inner = await dirUsage(full);
      usage.bytes += inner.bytes;
      usage.files += inner.files;
      usage.folders += inner.folders;
      continue;
    }
    usage.files += 1;
    try {
      // lstat via stat on the entry itself: readdir already told us it is not
      // a directory, and a broken link simply contributes nothing.
      usage.bytes += (await stat(full)).size;
    } catch {
      /* vanished between the listing and the stat */
    }
  }
  return usage;
}
