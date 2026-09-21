import type { Group } from "@app/shared";
import { GROUP_ADMIN_ID, GROUP_MEMBER_ID } from "@app/shared";
import type { Dictionary } from "@/lib/i18n";

/**
 * What to call a group on screen.
 *
 * The two built-in groups are seeded into the database in English when an
 * instance is created, so their names are data and the language switcher could
 * never touch them: a French interface still read "Members". They are
 * identified by a fixed id, so the name is translated from that instead, and
 * only groups someone created themselves keep the name they were given.
 */
export function groupName(
  group: Pick<Group, "id" | "name"> | null | undefined,
  t: Dictionary,
  fallback = "",
): string {
  if (!group) return fallback;
  return groupNameById(group.id, t) ?? group.name;
}

/** The same, when only the id is at hand. Null for a group we did not seed. */
export function groupNameById(id: string, t: Dictionary): string | null {
  const names = t.settings.users.groups.builtIn;
  if (id === GROUP_ADMIN_ID) return names.admin;
  if (id === GROUP_MEMBER_ID) return names.member;
  return null;
}
