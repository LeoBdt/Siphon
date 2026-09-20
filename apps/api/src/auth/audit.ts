import type { AuditAction, AuditEntry } from "@app/shared";
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

/** Entries older than this are dropped, so the table cannot grow forever. */
const KEEP_DAYS = 180;

export function record(entry: {
  action: AuditAction;
  actorId?: string | null;
  actorName?: string | null;
  target?: string | null;
  ip?: string | null;
}): void {
  db.prepare(
    `INSERT INTO audit (at, action, actorId, actorName, target, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    entry.action,
    entry.actorId ?? null,
    entry.actorName ?? null,
    entry.target ?? null,
    entry.ip ?? null,
  );
}

export function listAudit(limit = 100, before?: string): AuditEntry[] {
  const rows = (
    before
      ? db
          .prepare(
            `SELECT id, at, action, actorName, target, ip FROM audit
             WHERE at < ? ORDER BY at DESC LIMIT ?`,
          )
          .all(before, limit)
      : db
          .prepare(
            `SELECT id, at, action, actorName, target, ip FROM audit
             ORDER BY at DESC LIMIT ?`,
          )
          .all(limit)
  ) as unknown as AuditEntry[];
  return rows;
}

export function pruneAudit(): void {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  db.prepare(`DELETE FROM audit WHERE at < ?`).run(cutoff);
}
