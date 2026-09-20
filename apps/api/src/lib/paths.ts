import { resolve, relative, isAbsolute, sep, join } from "node:path";
import { realpathSync } from "node:fs";
import { config } from "../config.js";

/**
 * Sandbox helpers. Every path coming from the client is relative to a base
 * directory and must resolve to a location *inside* it. This is the security
 * core of the file manager — it must reject traversal (`..`), absolute paths,
 * and symlink escapes before any fs operation runs.
 *
 * The base defaults to ROOT_DIR, but a member confined to their own folder gets
 * that folder instead. Passing it in rather than checking permissions here
 * keeps this module about paths and nothing else — and means a caller cannot
 * forget to scope by accident, because the base is always explicit at the call
 * site that has the user.
 */

export class PathError extends Error {
  statusCode = 400;
}

/** Normalise a client-supplied relative path to forward-slash form. */
export function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Resolve a client relative path to an absolute path guaranteed to sit inside
 * ROOT_DIR. Throws PathError otherwise. Does NOT require the path to exist.
 */
export function resolveInsideRoot(rel: string, base = config.rootDir): string {
  const cleaned = normalizeRel(rel ?? "");
  if (isAbsolute(cleaned)) {
    throw new PathError("Absolute paths are not allowed");
  }
  const abs = resolve(base, cleaned);
  const rootWithSep = base.endsWith(sep) ? base : base + sep;
  if (abs !== base && !abs.startsWith(rootWithSep)) {
    throw new PathError("Path escapes the root directory");
  }
  return abs;
}

/**
 * Like resolveInsideRoot but also resolves symlinks on the *existing* portion
 * of the path, defeating symlink-escape attacks. Use before reads/deletes of
 * paths that already exist.
 */
export function resolveExistingInsideRoot(
  rel: string,
  base = config.rootDir,
): string {
  const abs = resolveInsideRoot(rel, base);
  try {
    const real = realpathSync(abs);
    const rootReal = realpathSync(base);
    const rootWithSep = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
    if (real !== rootReal && !real.startsWith(rootWithSep)) {
      throw new PathError("Path escapes the root directory (symlink)");
    }
    return real;
  } catch (err) {
    if (err instanceof PathError) throw err;
    // Path doesn't exist yet — return the sandbox-checked absolute path.
    return abs;
  }
}

/** Convert an absolute path back to its ROOT_DIR-relative, forward-slash form. */
export function toRel(abs: string, base = config.rootDir): string {
  const rel = relative(base, abs);
  return rel.split(sep).join("/");
}

export { join as joinPath };
