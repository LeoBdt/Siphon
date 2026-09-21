import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { User } from "@app/shared";
import { config } from "../config.js";
import { getUser } from "./store.js";

/**
 * Which slice of the library a member sees.
 *
 * Someone with `canBrowseWholeLibrary` works from ROOT_DIR, exactly as before
 * accounts existed — which is what keeps an upgraded instance's files where
 * they were, belonging to the administrator rather than to nobody. Everyone
 * else is confined to a folder of their own, and every path they send is
 * resolved against it, so "../" buys them nothing.
 */
export function libraryRootFor(
  /** A user, or just their id — the download queue only keeps the latter. */
  who: User | string | null | undefined,
): string {
  const user = typeof who === "string" ? getUser(who) : who;
  if (!user || user.effective.canBrowseWholeLibrary) return config.rootDir;
  const dir = join(config.rootDir, "users", user.libraryDir);
  // Created on demand rather than at signup: an account that never downloads
  // anything should not leave an empty folder behind.
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Folder names to hide from a listing of the shared `users` directory.
 *
 * Only applies to someone browsing the whole library, since nobody else can
 * see other members' folders at all. Discretion rather than enforcement: the
 * interface says as much, because whoever runs the server reads the disk.
 */
export function hiddenFrom(
  user: User | undefined,
  privateDirs: Set<string>,
): (name: string, parentRel: string) => boolean {
  return (name, parentRel) => {
    if (!user) return false;
    // An administrator sees every folder, private ones marked with a padlock
    // rather than removed. Hiding them from the one account that can read the
    // disk directly bought no privacy and cost them an accurate picture of
    // what their own server holds.
    if (user.effective.isAdmin) return false;
    if (parentRel !== "users") return false;
    return privateDirs.has(name) && name !== user.libraryDir;
  };
}
