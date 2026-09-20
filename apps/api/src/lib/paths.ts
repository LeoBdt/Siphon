import { resolve, relative, isAbsolute, sep, join } from "node:path";
import { realpathSync } from "node:fs";
import { config } from "../config.js";

/**
 * Sandbox helpers. Every path coming from the client is relative to ROOT_DIR
 * and must resolve to a location *inside* ROOT_DIR. This is the security core
 * of the file manager — it must reject traversal (`..`), absolute paths, and
 * symlink escapes before any fs operation runs.
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
export function resolveInsideRoot(rel: string): string {
  const cleaned = normalizeRel(rel ?? "");
  if (isAbsolute(cleaned)) {
    throw new PathError("Chemin absolu interdit");
  }
  const abs = resolve(config.rootDir, cleaned);
  const rootWithSep = config.rootDir.endsWith(sep)
    ? config.rootDir
    : config.rootDir + sep;
  if (abs !== config.rootDir && !abs.startsWith(rootWithSep)) {
    throw new PathError("Chemin hors du dossier racine");
  }
  return abs;
}

/**
 * Like resolveInsideRoot but also resolves symlinks on the *existing* portion
 * of the path, defeating symlink-escape attacks. Use before reads/deletes of
 * paths that already exist.
 */
export function resolveExistingInsideRoot(rel: string): string {
  const abs = resolveInsideRoot(rel);
  try {
    const real = realpathSync(abs);
    const rootReal = realpathSync(config.rootDir);
    const rootWithSep = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
    if (real !== rootReal && !real.startsWith(rootWithSep)) {
      throw new PathError("Chemin hors du dossier racine (lien symbolique)");
    }
    return real;
  } catch (err) {
    if (err instanceof PathError) throw err;
    // Path doesn't exist yet — return the sandbox-checked absolute path.
    return abs;
  }
}

/** Convert an absolute path back to its ROOT_DIR-relative, forward-slash form. */
export function toRel(abs: string): string {
  const rel = relative(config.rootDir, abs);
  return rel.split(sep).join("/");
}

export { join as joinPath };
