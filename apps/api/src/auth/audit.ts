import type { AuditAction, AuditChange, AuditEntry } from "@app/shared";
import { db } from "../db.js";

/**
 * An append-only record of who did what.
 *
 * Kept in the same database as everything else: a self-hosted instance has one
 * moving part, and a log that needs its own service is a log nobody runs.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL,
    action    TEXT NOT NULL,
    actorId   TEXT,
    actorName TEXT,
    target    TEXT,
    ip        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC);
`);

// Added after the initial schema: what actually changed, as JSON. Without it
// the log could only ever say that somebody edited something.
try {
  db.exec(`ALTER TABLE audit ADD COLUMN details TEXT`);
} catch {
  /* column already exists */
}

/** Entries older than this are dropped, so the table cannot grow forever. */
const KEEP_DAYS = 180;

export function record(entry: {
  action: AuditAction;
  actorId?: string | null;
  actorName?: string | null;
  target?: string | null;
  ip?: string | null;
  /**
   * What changed, field by field.
   *
   * Frozen at the moment of the action, like the rest of the row: this is a
   * register, and a register that re-reads the world every time it is
   * displayed is not a record of anything.
   */
  details?: AuditChange[] | null;
}): void {
  db.prepare(
    `INSERT INTO audit (at, action, actorId, actorName, target, ip, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    entry.action,
    entry.actorId ?? null,
    entry.actorName ?? null,
    entry.target ?? null,
    entry.ip ?? null,
    entry.details?.length ? JSON.stringify(entry.details) : null,
  );
}

export function listAudit(limit = 100, before?: string): AuditEntry[] {
  const rows = (
    before
      ? db
          .prepare(
            `SELECT id, at, action, actorName, target, ip, details FROM audit
             WHERE at < ? ORDER BY at DESC LIMIT ?`,
          )
          .all(before, limit)
      : db
          .prepare(
            `SELECT id, at, action, actorName, target, ip, details FROM audit
             ORDER BY at DESC LIMIT ?`,
          )
          .all(limit)
  ) as unknown as (Omit<AuditEntry, "details"> & { details: string | null })[];

  return rows.map((row) => ({
    ...row,
    // Rows written before the column existed have none, and a row whose JSON
    // cannot be read is reported as having no detail rather than breaking the
    // page it appears on.
    details: row.details ? safeParse(row.details) : null,
  }));
}

function safeParse(json: string): AuditChange[] | null {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as AuditChange[]) : null;
  } catch {
    return null;
  }
}

export function pruneAudit(): void {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  db.prepare(`DELETE FROM audit WHERE at < ?`).run(cutoff);
}
