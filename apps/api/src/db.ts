import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DownloadJob, DownloadStatus, QualityPresetId } from "@app/shared";
import { config } from "./config.js";

/**
 * SQLite persistence backed by Node's built-in `node:sqlite` (no native build).
 * A single `downloads` table stores both single-video jobs and playlist parents
 * (isPlaylistParent = 1); child jobs reference their parent via playlistId.
 */

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS downloads (
    id                TEXT PRIMARY KEY,
    url               TEXT NOT NULL,
    title             TEXT,
    thumbnailUrl      TEXT,
    durationSeconds   INTEGER,
    preset            TEXT NOT NULL,
    destPath          TEXT NOT NULL,
    status            TEXT NOT NULL,
    progress          REAL NOT NULL DEFAULT 0,
    outputFile        TEXT,
    fileSizeBytes     INTEGER,
    errorMessage      TEXT,
    speedBytesPerSec  REAL,
    etaSeconds        REAL,
    playlistId        TEXT,
    isPlaylistParent  INTEGER NOT NULL DEFAULT 0,
    childCount        INTEGER,
    phase             TEXT,
    createdAt         TEXT NOT NULL,
    updatedAt         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
  CREATE INDEX IF NOT EXISTS idx_downloads_playlist ON downloads(playlistId);
  CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(createdAt);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Lightweight migration: add columns introduced after the initial schema.
for (const col of [
  "phase TEXT",
  "maxHeight INTEGER",
  "maxFps INTEGER",
  "errorCode TEXT",
  "retention TEXT NOT NULL DEFAULT 'library'",
  "userId TEXT",
]) {
  try {
    db.exec(`ALTER TABLE downloads ADD COLUMN ${col}`);
  } catch {
    /* column already exists */
  }
}

/** Value types accepted by node:sqlite bound parameters. */
type SqlValue = null | number | bigint | string | Uint8Array;
type SqlParams = Record<string, SqlValue>;

type Row = {
  id: string;
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  preset: string;
  destPath: string;
  status: string;
  progress: number;
  outputFile: string | null;
  fileSizeBytes: number | null;
  retention: string;
  userId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
  playlistId: string | null;
  isPlaylistParent: number;
  childCount: number | null;
  phase: string | null;
  maxHeight: number | null;
  maxFps: number | null;
  createdAt: string;
  updatedAt: string;
};

function rowToJob(r: Row): DownloadJob {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl,
    durationSeconds: r.durationSeconds,
    preset: r.preset as QualityPresetId,
    destPath: r.destPath,
    status: r.status as DownloadStatus,
    progress: r.progress,
    outputFile: r.outputFile,
    fileSizeBytes: r.fileSizeBytes,
    errorCode: (r.errorCode as DownloadJob["errorCode"]) ?? null,
    errorMessage: r.errorMessage,
    speedBytesPerSec: r.speedBytesPerSec,
    etaSeconds: r.etaSeconds,
    playlistId: r.playlistId,
    isPlaylistParent: r.isPlaylistParent === 1,
    childCount: r.childCount,
    // Filled in by the listing for playlist parents — see `withChildCounts`.
    completedCount: null,
    failedCount: null,
    phase: (r.phase as DownloadJob["phase"]) ?? null,
    retention: (r.retention as DownloadJob["retention"]) ?? "library",
    userId: r.userId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface NewJob {
  id: string;
  url: string;
  title?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  preset: QualityPresetId;
  destPath: string;
  status: DownloadStatus;
  playlistId?: string | null;
  isPlaylistParent?: boolean;
  childCount?: number | null;
  maxHeight?: number | null;
  maxFps?: number | null;
  retention?: string;
  userId?: string | null;
}

const insertStmt = db.prepare(`
  INSERT INTO downloads (
    id, url, title, thumbnailUrl, durationSeconds, preset, destPath, status,
    progress, playlistId, isPlaylistParent, childCount, maxHeight, maxFps,
    retention, userId, createdAt, updatedAt
  ) VALUES (
    $id, $url, $title, $thumbnailUrl, $durationSeconds, $preset, $destPath, $status,
    0, $playlistId, $isPlaylistParent, $childCount, $maxHeight, $maxFps,
    $retention, $userId, $now, $now
  )
`);

export function insertJob(job: NewJob): DownloadJob {
  const now = new Date().toISOString();
  insertStmt.run({
    id: job.id,
    url: job.url,
    title: job.title ?? null,
    thumbnailUrl: job.thumbnailUrl ?? null,
    durationSeconds: job.durationSeconds ?? null,
    preset: job.preset,
    destPath: job.destPath,
    status: job.status,
    playlistId: job.playlistId ?? null,
    isPlaylistParent: job.isPlaylistParent ? 1 : 0,
    childCount: job.childCount ?? null,
    maxHeight: job.maxHeight ?? null,
    maxFps: job.maxFps ?? null,
    retention: job.retention ?? "library",
    userId: job.userId ?? null,
    now,
  });
  return getJob(job.id)!;
}

/** Fetch the format overrides stored for a job (for the download runner). */
export function getJobFormat(
  id: string,
): { maxHeight: number | null; maxFps: number | null } | null {
  const row = getStmt.get(id) as Row | undefined;
  if (!row) return null;
  return { maxHeight: row.maxHeight ?? null, maxFps: row.maxFps ?? null };
}

const getStmt = db.prepare(`SELECT * FROM downloads WHERE id = ?`);

export function getJob(id: string): DownloadJob | null {
  const row = getStmt.get(id) as Row | undefined;
  return row ? rowToJob(row) : null;
}

/** Columns callers are allowed to patch. */
type Patch = Partial<
  Pick<
    Row,
    | "title"
    | "thumbnailUrl"
    | "durationSeconds"
    | "status"
    | "progress"
    | "outputFile"
    | "fileSizeBytes"
    | "errorCode"
    | "errorMessage"
    | "speedBytesPerSec"
    | "etaSeconds"
    | "childCount"
    | "phase"
  >
>;

export function updateJob(id: string, patch: Patch): DownloadJob | null {
  const keys = Object.keys(patch);
  if (keys.length === 0) return getJob(id);
  const setSql = keys.map((k) => `${k} = $${k}`).join(", ");
  const stmt = db.prepare(
    `UPDATE downloads SET ${setSql}, updatedAt = $updatedAt WHERE id = $id`,
  );
  const params: SqlParams = { id, updatedAt: new Date().toISOString() };
  for (const k of keys) {
    params[k] = (patch as Record<string, SqlValue>)[k] ?? null;
  }
  stmt.run(params);
  return getJob(id);
}

export interface ListFilter {
  status?: DownloadStatus;
  search?: string;
  limit?: number;
  offset?: number;
  /**
   * Whose jobs to return. `undefined` means everyone's, which only an
   * administrator is ever allowed to ask for — the route decides, not this
   * function. A plain member always arrives here with their own id.
   */
  userId?: string;
  /** Attach each playlist parent's entries. See `withChildCounts`. */
  withChildren?: boolean;
}

export function listJobs(filter: ListFilter = {}): DownloadJob[] {
  const clauses: string[] = [
    // Hide child jobs from the top-level history; they surface under their parent.
    "playlistId IS NULL",
  ];
  const params: SqlParams = {};
  if (filter.userId) {
    clauses.push("userId = $userId");
    params.userId = filter.userId;
  }
  if (filter.status) {
    clauses.push("status = $status");
    params.status = filter.status;
  }
  if (filter.search) {
    clauses.push("(title LIKE $q OR url LIKE $q)");
    params.q = `%${filter.search}%`;
  }
  params.limit = filter.limit ?? 100;
  params.offset = filter.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT * FROM downloads WHERE ${clauses.join(" AND ")}
       ORDER BY createdAt DESC LIMIT $limit OFFSET $offset`,
    )
    .all(params) as Row[];
  return withChildCounts(rows.map(rowToJob), filter.withChildren === true);
}

/**
 * Fill in each playlist parent's tally of finished and failed entries.
 *
 * One grouped query for the whole page rather than one per parent, and
 * counted at read time rather than stored: a stored tally is a tally that can
 * disagree with its children after a retry or a deletion.
 *
 * With `withChildren`, the entries themselves are attached too. That is for
 * the file manager, which draws one tile per entry with its own progress; a
 * history listing asks for the counts alone, because a hundred playlists of a
 * hundred entries is not a payload anyone wants.
 */
function withChildCounts(jobs: DownloadJob[], withChildren: boolean): DownloadJob[] {
  const parentIds = jobs.filter((j) => j.isPlaylistParent).map((j) => j.id);
  if (parentIds.length === 0) return jobs;

  const placeholders = parentIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT playlistId,
              SUM(status = 'completed')                  AS completed,
              SUM(status = 'error' OR status = 'canceled') AS failed
         FROM downloads
        WHERE playlistId IN (${placeholders})
        GROUP BY playlistId`,
    )
    .all(...parentIds) as {
    playlistId: string;
    completed: number;
    failed: number;
  }[];
  const byParent = new Map(rows.map((r) => [r.playlistId, r]));

  return jobs.map((job) => {
    if (!job.isPlaylistParent) return job;
    const tally = byParent.get(job.id);
    return {
      ...job,
      completedCount: tally?.completed ?? 0,
      failedCount: tally?.failed ?? 0,
      ...(withChildren ? { children: listChildren(job.id) } : {}),
    };
  });
}

/**
 * What one member has put through the app.
 *
 * Counts children too — a playlist of forty videos is forty downloads, and
 * hiding them behind their parent would understate the load by an order of
 * magnitude. Bytes come from the jobs rather than from the disk, so a file
 * deleted afterwards still shows in what was fetched; disk usage is measured
 * separately, from the folder itself.
 */
export function downloadStatsFor(userId: string): {
  total: number;
  completed: number;
  failed: number;
  bytesFetched: number;
  lastDownloadAt: string | null;
} {
  const row = db
    .prepare(
      `SELECT
         COUNT(*)                                        AS total,
         SUM(status = 'completed')                       AS completed,
         SUM(status IN ('error','canceled'))             AS failed,
         COALESCE(SUM(CASE WHEN status = 'completed'
                           THEN fileSizeBytes END), 0)   AS bytesFetched,
         MAX(createdAt)                                  AS lastDownloadAt
       FROM downloads
       WHERE userId = ? AND isPlaylistParent = 0`,
    )
    .get(userId) as unknown as {
    total: number;
    completed: number | null;
    failed: number | null;
    bytesFetched: number;
    lastDownloadAt: string | null;
  };
  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    failed: row?.failed ?? 0,
    bytesFetched: row?.bytesFetched ?? 0,
    lastDownloadAt: row?.lastDownloadAt ?? null,
  };
}

export function listChildren(parentId: string): DownloadJob[] {
  const rows = db
    .prepare(
      `SELECT * FROM downloads WHERE playlistId = ? ORDER BY createdAt ASC`,
    )
    .all(parentId) as Row[];
  return rows.map(rowToJob);
}

export function deleteJob(id: string): void {
  // Remove children first if this is a parent.
  db.prepare(`DELETE FROM downloads WHERE playlistId = ?`).run(id);
  db.prepare(`DELETE FROM downloads WHERE id = ?`).run(id);
}

/**
 * On boot, requeue any jobs left mid-flight by a crash/restart so they resume
 * (yt-dlp continues partial `.part` files by default). Progress/speed/eta are
 * reset; the actual re-enqueue is driven by the downloads-manager.
 */
export function reconcileOnBoot(): void {
  db.prepare(
    `UPDATE downloads
     SET status = 'queued', progress = 0, speedBytesPerSec = NULL,
         etaSeconds = NULL, phase = NULL, updatedAt = $now
     WHERE status IN ('fetching-info','downloading','processing')`,
  ).run({ now: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Settings (simple key/value store)
// ---------------------------------------------------------------------------

const getSettingStmt = db.prepare(`SELECT value FROM settings WHERE key = ?`);
const setSettingStmt = db.prepare(
  `INSERT INTO settings (key, value) VALUES ($key, $value)
   ON CONFLICT(key) DO UPDATE SET value = $value`,
);

export function getSetting(key: string): string | null {
  const row = getSettingStmt.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  setSettingStmt.run({ key, value });
}

/** Leaf (non-parent) jobs currently queued — used to re-enqueue on boot. */
export function listQueuedLeafJobs(): DownloadJob[] {
  const rows = db
    .prepare(
      `SELECT * FROM downloads
       WHERE status = 'queued' AND isPlaylistParent = 0
       ORDER BY createdAt ASC`,
    )
    .all() as Row[];
  return rows.map(rowToJob);
}
