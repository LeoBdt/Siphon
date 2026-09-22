import type { AuditChange } from "@app/shared";

/**
 * Turning an edit into a list of what it changed.
 *
 * The log used to hold only "somebody edited a group", which answers nothing:
 * the question asked of an audit trail is always *what* was changed, and by
 * the time anyone asks, the group has been edited five times since.
 *
 * Values are rendered here, at the moment of the action, rather than kept as
 * ids to resolve later. A register that re-reads today's world is a register
 * of today, not of what happened.
 */

/** A value as the log should remember it. */
function render(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * The fields that differ between two states.
 *
 * Only the keys present in `next` are looked at, because a patch says what it
 * means to change — comparing against every field would report as unchanged a
 * hundred things nobody touched. A key whose value is identical is left out:
 * sending a form back unchanged is not an event.
 */
export function diffFields(
  previous: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
  /** Keys never worth recording, such as a password hash. */
  skip: string[] = [],
): AuditChange[] {
  if (!next) return [];
  const changes: AuditChange[] = [];
  for (const [field, value] of Object.entries(next)) {
    if (skip.includes(field)) continue;
    // A key carrying `undefined` was not part of the patch — a caller building
    // `{ name: body.name }` from a body that had no name lands here. Recording
    // it read as "Name: Members → unset", which is the opposite of what
    // happened: nothing touched the name at all.
    if (value === undefined) continue;
    const before = render(previous?.[field]);
    const after = render(value);
    if (before === after) continue;
    changes.push({ field, from: before, to: after });
  }
  return changes;
}
