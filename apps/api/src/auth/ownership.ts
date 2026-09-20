import type { User } from "@app/shared";

/**
 * Whether a job belongs to whoever is asking about it.
 *
 * An administrator sees everything, which is the point of the role. Everyone
 * else is limited to what they started: their history is theirs, and someone
 * else's is none of their business.
 *
 * Jobs with no owner predate accounts and belong to the administrator, the
 * same way the pre-existing library does. Handing them to the first member who
 * asks would be the opposite of what upgrading promised.
 *
 * Kept in a module of its own, importing nothing but a type, so a test can
 * exercise it without opening a database or touching the disk.
 */
export function mayTouchJob(
  job: { userId: string | null } | null | undefined,
  user: Pick<User, "id" | "effective"> | null | undefined,
): boolean {
  if (!job) return false;
  if (user?.effective.isAdmin) return true;
  return job.userId != null && job.userId === user?.id;
}
