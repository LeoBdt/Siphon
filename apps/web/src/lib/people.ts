import type { User } from "@app/shared";

/**
 * What to call someone.
 *
 * `personName` is for lists an administrator reads, where falling back to the
 * handle is better than a blank row. `addressableName` is for sentences shown
 * to a human — an invitation, a greeting — where a username has no business:
 * "admin invites you to join" reads like a machine wrote it, so the sentence
 * is rephrased without a name instead.
 */
export function personName(
  user: Pick<User, "displayName" | "username"> | null | undefined,
  fallback = "—",
): string {
  if (!user) return fallback;
  return user.displayName?.trim() || user.username;
}

export function addressableName(
  user: Pick<User, "displayName"> | null | undefined,
): string | null {
  return user?.displayName?.trim() || null;
}

/** True when the handle adds something the name does not already say. */
export function hasDistinctHandle(
  user: Pick<User, "displayName" | "username">,
): boolean {
  return Boolean(user.displayName?.trim());
}
