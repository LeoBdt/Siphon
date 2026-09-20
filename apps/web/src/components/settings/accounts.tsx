"use client";

import { useState } from "react";
import {
  Link2,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  ScrollText,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Group, Permissions, User } from "@app/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/i18n-provider";
import {
  useAudit,
  useAuthState,
  useCreateInvite,
  useDeleteUser,
  useSuspendUser,
  useUnlockUser,
  useGroups,
  useInvites,
  useRevokeInvite,
  useSaveGroup,
  useSaveUser,
  useUsers,
} from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The boolean permissions, in the order they are worth reading. */
const FLAGS = [
  "canDownload",
  "canKeepInLibrary",
  "canManageFiles",
  "canHavePrivateFolder",
  "canBrowseWholeLibrary",
  "canManageSettings",
  "isAdmin",
] as const;

type Flag = (typeof FLAGS)[number];

function Toggle({
  checked,
  disabled,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 text-sm",
        disabled && "opacity-50",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="flex flex-col">
        {label}
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------

export function MembersCard() {
  const { t, intl, errorMessage } = useI18n();
  const { data: me } = useAuthState();
  const { data: users, isLoading } = useUsers();
  const { data: groups } = useGroups();
  const save = useSaveUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          {t.settings.accounts.members}
        </CardTitle>
        <CardDescription>{t.settings.accounts.membersHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          users?.map((user) => (
            <MemberRow
              key={user.id}
              user={user}
              groups={groups ?? []}
              isSelf={user.id === me?.user?.id}
              onGroup={(groupId) =>
                save.mutate(
                  { id: user.id, groupId },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
              onOverride={(flag, value) =>
                save.mutate(
                  { id: user.id, overrides: { [flag]: value } },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
              formatWhen={(iso) => formatDate(iso, intl)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({
  user,
  groups,
  isSelf,
  onGroup,
  onOverride,
  formatWhen,
}: {
  user: User;
  groups: Group[];
  isSelf: boolean;
  onGroup: (groupId: string) => void;
  onOverride: (flag: Flag, value: boolean | null) => void;
  formatWhen: (iso: string) => string;
}) {
  const { t, errorMessage } = useI18n();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const suspend = useSuspendUser();
  const unlock = useUnlockUser();
  const remove = useDeleteUser();

  const a = t.settings.accounts;

  return (
    <div className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">
          {user.username}
          {isSelf && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({a.you})
            </span>
          )}
        </span>

        {/* Two different states, never conflated: a decision, and a counter. */}
        {user.suspended ? (
          <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            {a.suspended}
          </span>
        ) : user.lockedUntil ? (
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            {a.lockedBySystem(formatWhen(user.lockedUntil))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {user.lastSeenAt ? a.lastSeen(formatWhen(user.lastSeenAt)) : a.neverSignedIn}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Select value={user.groupId} onValueChange={(v) => v && onGroup(v)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {user.lockedUntil && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                unlock.mutate(user.id, {
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              <LockOpen className="size-4" />
              {a.unlock}
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "–" : "+"}
          </Button>

          {!isSelf && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                title={user.suspended ? a.unsuspend : a.suspend}
                onClick={() =>
                  suspend.mutate(
                    { id: user.id, suspended: !user.suspended },
                    { onError: (e) => toast.error(errorMessage(e)) },
                  )
                }
              >
                {user.suspended ? (
                  <LockOpen className="size-4" />
                ) : (
                  <Lock className="size-4" />
                )}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title={a.deleteMember}
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setTyped("");
                  setConfirming(true);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
          {FLAGS.map((flag) => (
            <Toggle
              key={flag}
              label={a.permissions[flag]}
              hint={user.overrides[flag] === null ? a.inherited : undefined}
              checked={Boolean(user.effective[flag])}
              onChange={(next) => onOverride(flag, next)}
            />
          ))}
        </div>
      )}

      {/*
        Deleting takes the files with it, so it asks for the name to be typed.
        A second button to click is not a second thought; typing the name is.
      */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{a.deleteTitle(user.username)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{a.deleteWarning}</p>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={a.deleteConfirm(user.username)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={typed !== user.username || remove.isPending}
              onClick={() =>
                remove.mutate(user.id, {
                  onSuccess: () => {
                    setConfirming(false);
                    toast.success(a.deleted);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              {a.deleteAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function GroupsCard() {
  const { t, errorMessage } = useI18n();
  const { data: groups, isLoading } = useGroups();
  const save = useSaveGroup();
  const [name, setName] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          {t.settings.accounts.groups}
        </CardTitle>
        <CardDescription>{t.settings.accounts.groupsHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          groups?.map((group) => (
            <div key={group.id} className="rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{group.name}</span>
                <span className="text-xs text-muted-foreground">
                  {group.memberCount}
                </span>
              </div>
              <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
                {FLAGS.map((flag) => (
                  <Toggle
                    key={flag}
                    label={t.settings.accounts.permissions[flag]}
                    checked={Boolean(group.permissions[flag as keyof Permissions])}
                    // Built-in Administrators must keep their powers, or the
                    // instance can be left with nobody able to manage it.
                    disabled={group.id === "admin"}
                    onChange={(next) =>
                      save.mutate(
                        { id: group.id, permissions: { [flag]: next } },
                        { onError: (e) => toast.error(errorMessage(e)) },
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.settings.accounts.groupName}
            className="h-9"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!name.trim()}
            onClick={() =>
              save.mutate(
                { name: name.trim() },
                {
                  onSuccess: () => setName(""),
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            <Plus className="size-4" />
            {t.settings.accounts.newGroup}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function InvitesCard() {
  const { t, intl, errorMessage } = useI18n();
  const { data: invites } = useInvites();
  const { data: groups } = useGroups();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const [groupId, setGroupId] = useState("member");

  async function invite() {
    create.mutate(groupId, {
      onSuccess: async (created) => {
        // Built here, not on the server: the address the admin is using is the
        // only one known to work, and the server cannot see its public host.
        const link = `${window.location.origin}/invite/${created.token}`;
        try {
          await navigator.clipboard.writeText(link);
          toast.success(t.settings.accounts.inviteCopied);
        } catch {
          toast.message(link);
        }
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" />
          {t.settings.accounts.invite}
        </CardTitle>
        <CardDescription>{t.settings.accounts.inviteHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={groupId} onValueChange={(v) => v && setGroupId(v)}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groups?.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={invite} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            {t.settings.accounts.invite}
          </Button>
        </div>

        {invites?.map((inv) => (
          <div
            key={inv.token}
            className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="font-medium">{inv.groupName}</span>
            <span className="text-xs text-muted-foreground">
              {t.settings.accounts.inviteExpires(formatDate(inv.expiresAt, intl))}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() =>
                revoke.mutate(inv.token, {
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {t.settings.accounts.revoke}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/** The audit trail: who did what, newest first. */
export function AuditCard() {
  const { t, intl } = useI18n();
  const { data: entries, isLoading } = useAudit();
  const a = t.settings.audit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-4 text-primary" />
          {a.title}
        </CardTitle>
        <CardDescription>{a.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : !entries?.length ? (
          <p className="text-sm text-muted-foreground">{a.empty}</p>
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {formatDate(entry.at, intl)}
                    </td>
                    <td className="px-3 py-2">{a.actions[entry.action]}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {entry.actorName ?? "—"}
                      {entry.target && entry.target !== entry.actorName
                        ? ` → ${entry.target}`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {entry.ip ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
