"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthState, useUsers, type JobScope } from "@/lib/hooks";
import { useI18n } from "@/components/i18n-provider";
import { personName } from "@/lib/people";

/**
 * Serialised form of a scope, so it can live in a `useState` and in a Select
 * value without a second representation.
 */
export type ScopeKey = string;

export function scopeFromKey(key: ScopeKey): JobScope {
  if (key === "all" || key === "mine") return key;
  return { userId: key };
}

/**
 * Turns a job's owner id into a name to show beside it.
 *
 * Returns null for anyone who is not an administrator — they only ever see
 * their own jobs, so labelling each row with their own name would be noise.
 * Ownerless jobs predate accounts and get no badge rather than a made-up one.
 */
export function useJobAuthor(): (userId: string | null) => string | null {
  const { t } = useI18n();
  const { data: auth } = useAuthState();
  const isAdmin = auth?.user?.effective.isAdmin ?? false;
  const { data: users } = useUsers({ enabled: isAdmin });

  return (userId) => {
    if (!isAdmin || !userId) return null;
    if (userId === auth?.user?.id) return null;
    const user = users?.find((u) => u.id === userId);
    return user ? personName(user) : t.common.unknown;
  };
}

/**
 * Whose downloads to show.
 *
 * Only rendered for an administrator: everyone else sees their own and has no
 * choice to make, so a control with a single option would be noise. The server
 * enforces the same rule regardless of what this sends.
 */
export function JobScopeSelect({
  value,
  onChange,
  className,
}: {
  value: ScopeKey;
  onChange: (key: ScopeKey) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const { data: auth } = useAuthState();
  const isAdmin = auth?.user?.effective.isAdmin ?? false;
  // Skipped entirely for a member: the request would be refused anyway, and
  // asking for it would put a 403 in their console on every page load.
  const { data: users } = useUsers({ enabled: isAdmin });

  if (!isAdmin) return null;

  const labelFor = (key: ScopeKey) => {
    if (key === "all") return t.history.scope.all;
    if (key === "mine") return t.history.scope.mine;
    const user = users?.find((u) => u.id === key);
    return user ? personName(user) : t.common.unknown;
  };

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "all")}>
      <SelectTrigger className={className} aria-label={t.history.scope.label}>
        <SelectValue>{(v: string) => labelFor(v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t.history.scope.all}</SelectItem>
        <SelectItem value="mine">{t.history.scope.mine}</SelectItem>
        {users
          ?.filter((u) => u.id !== auth?.user?.id)
          .map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {personName(u)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
