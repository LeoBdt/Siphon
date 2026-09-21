"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Copy,
  HardDrive,
  History,
  Link2,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  ScrollText,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Group, Invite, PermissionOverrides, User } from "@app/shared";
import { MAX_INVITE_USES } from "@app/shared";
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
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/components/i18n-provider";
import {
  useAudit,
  useAuthState,
  useCreateInvite,
  useDeleteUser,
  useGroups,
  useInvites,
  useRevokeInvite,
  useSaveGroup,
  useSaveUser,
  useSuspendUser,
  useUnlockUser,
  useUsers,
  useUserStats,
} from "@/lib/hooks";
import { formatBytes, formatDate } from "@/lib/format";
import { personName } from "@/lib/people";
import {
  FLAGS,
  GroupLimitGrid,
  GroupPermissionGrid,
  UserLimitGrid,
  UserPermissionGrid,
  type Flag,
  type Limit,
} from "@/components/settings/permission-grid";
import { cn } from "@/lib/utils";

/**
 * Everything about who may use this instance, in four views.
 *
 * Previously one page stacked three expanding cards: ten accounts and five
 * groups made it a scroll, and editing a permission pushed everything below it
 * down the page. Each concern now has its own view, the list can be searched
 * and filtered, and editing happens in a dialog — so the list never moves
 * under the cursor.
 */
type Tab = "users" | "groups" | "invites" | "audit";

export function UsersSettings() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("users");
  const u = t.settings.users;

  return (
    <div className="flex flex-col gap-4">
      <Segmented<Tab>
        id="users-tabs"
        ariaLabel={u.title}
        value={tab}
        onChange={setTab}
        className="self-start"
        options={[
          { value: "users", label: u.tabs.users },
          { value: "groups", label: u.tabs.groups },
          { value: "invites", label: u.tabs.invites },
          { value: "audit", label: u.tabs.audit },
        ]}
      />

      {tab === "users" && <UsersTab />}
      {tab === "groups" && <GroupsTab />}
      {tab === "invites" && <InvitesTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

type StatusFilter = "any" | "active" | "suspended" | "locked" | "admins";

function UsersTab() {
  const { t, intl } = useI18n();
  const u = t.settings.users;
  const { data: me } = useAuthState();
  const { data: users, isLoading } = useUsers();
  const { data: groups } = useGroups();
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("any");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((user) => {
      if (groupId !== "any" && user.groupId !== groupId) return false;
      if (status === "active" && (user.suspended || user.lockedUntil)) return false;
      if (status === "suspended" && !user.suspended) return false;
      if (status === "locked" && !user.lockedUntil) return false;
      if (status === "admins" && !user.effective.isAdmin) return false;
      if (!q) return true;
      // Name, handle and group, because those are the three things someone
      // looking for an account actually remembers.
      return [user.displayName, user.username, user.groupName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [users, query, groupId, status]);

  // Kept as an id rather than the object: the list refetches after every edit,
  // and holding a copy would show a stale one until the dialog was reopened.
  const current = users?.find((user) => user.id === editing) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4 text-primary" />
          {u.title}
        </CardTitle>
        <CardDescription>
          {u.count(filtered.length, users?.length ?? 0)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={u.search}
              className="h-9 pl-9"
            />
          </div>
          <Select value={groupId} onValueChange={(v) => setGroupId(v ?? "any")}>
            <SelectTrigger className="h-9 sm:w-40">
              <SelectValue>
                {(v: string) =>
                  v === "any"
                    ? u.filterGroup
                    : (groups?.find((g) => g.id === v)?.name ?? v)
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{u.filterGroup}</SelectItem>
              {groups?.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => setStatus((v as StatusFilter) ?? "any")}
          >
            <SelectTrigger className="h-9 sm:w-40">
              <SelectValue>
                {(v: string) =>
                  v === "any"
                    ? u.filterStatus
                    : u.status[v as Exclude<StatusFilter, "any">]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{u.filterStatus}</SelectItem>
              <SelectItem value="active">{u.status.active}</SelectItem>
              <SelectItem value="suspended">{u.status.suspended}</SelectItem>
              <SelectItem value="locked">{u.status.locked}</SelectItem>
              <SelectItem value="admins">{u.status.admins}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {users?.length ? u.noResults : u.empty}
          </p>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {filtered.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === me?.user?.id}
                formatWhen={(iso) => formatDate(iso, intl)}
                onManage={() => setEditing(user.id)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <UserDialog
        user={current}
        groups={groups ?? []}
        isSelf={current?.id === me?.user?.id}
        onOpenChange={(open) => !open && setEditing(null)}
        formatWhen={(iso) => formatDate(iso, intl)}
      />
    </Card>
  );
}

function UserRow({
  user,
  isSelf,
  formatWhen,
  onManage,
}: {
  user: User;
  isSelf: boolean;
  formatWhen: (iso: string) => string;
  onManage: () => void;
}) {
  const { t } = useI18n();
  const u = t.settings.users;
  const named = Boolean(user.displayName?.trim());

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      <UserRound className="size-4 shrink-0 text-muted-foreground" />

      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 truncate font-medium">
          {named ? user.displayName : user.username}
          {isSelf && (
            <span className="text-xs font-normal text-muted-foreground">
              ({u.you})
            </span>
          )}
        </span>
        {/* The handle only earns a line when it is not already the title. */}
        <span className="truncate text-xs text-muted-foreground">
          {named ? `@${user.username}` : u.noName}
        </span>
      </div>

      <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
        {user.groupName}
      </span>

      {/* Two different states, never conflated: a decision, and a counter. */}
      {user.suspended ? (
        <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          {u.suspended}
        </span>
      ) : user.lockedUntil ? (
        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          {u.status.locked}
        </span>
      ) : (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {user.lastSeenAt
            ? u.lastSeen(formatWhen(user.lastSeenAt))
            : u.neverSignedIn}
        </span>
      )}

      <Button size="sm" variant="ghost" className="ml-auto" onClick={onManage}>
        <SlidersHorizontal className="size-4" />
        {u.manage}
      </Button>
    </div>
  );
}

/**
 * Everything about one account, in a dialog.
 *
 * Permissions save as they are changed rather than behind an Apply button: a
 * single field is being set, the server answers with the resulting account,
 * and a pending change that could be lost by closing the dialog would be worse
 * than an immediate one.
 */
function UserDialog({
  user,
  groups,
  isSelf,
  onOpenChange,
  formatWhen,
}: {
  user: User | null;
  groups: Group[];
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
  formatWhen: (iso: string) => string;
}) {
  const { t, errorMessage } = useI18n();
  const u = t.settings.users;
  const save = useSaveUser();
  const suspend = useSuspendUser();
  const unlock = useUnlockUser();
  const remove = useDeleteUser();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  if (!user) return null;
  const group = groups.find((g) => g.id === user.groupId);
  const fail = (e: unknown) => toast.error(errorMessage(e));

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-baseline gap-2">
              {personName(user)}
              <span className="text-xs font-normal text-muted-foreground">
                @{user.username}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{u.dialog.group}</span>
            <Select
              value={user.groupId}
              onValueChange={(v) =>
                v && save.mutate({ id: user.id, groupId: v }, { onError: fail })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue>
                  {(v: string) => groups.find((g) => g.id === v)?.name ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{u.dialog.groupHint}</p>
          </div>

          <div>
            <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {u.dialog.permissions}
            </h4>
            <UserPermissionGrid
              group={group}
              overrides={user.overrides as PermissionOverrides}
              onChange={(flag: Flag, value) =>
                save.mutate(
                  { id: user.id, overrides: { [flag]: value } },
                  { onError: fail },
                )
              }
            />
            <UserLimitGrid
              group={group}
              overrides={user.overrides as PermissionOverrides}
              onChange={(limit: Limit, value) =>
                save.mutate(
                  // undefined means "inherit", which the API stores as null —
                  // the same shape the boolean overrides use.
                  { id: user.id, overrides: { [limit]: value ?? null } },
                  { onError: fail },
                )
              }
            />
          </div>

          <UserStats user={user} formatWhen={formatWhen} />

          <DialogFooter className="flex-wrap gap-2">
            {user.lockedUntil && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => unlock.mutate(user.id, { onError: fail })}
              >
                <LockOpen className="size-4" />
                {u.unlock}
              </Button>
            )}
            {/* Suspending or deleting oneself is never what was meant, and the
                server refuses it anyway. */}
            {!isSelf && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    suspend.mutate(
                      { id: user.id, suspended: !user.suspended },
                      { onError: fail },
                    )
                  }
                >
                  {user.suspended ? (
                    <LockOpen className="size-4" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  {user.suspended ? u.unsuspend : u.suspend}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setTyped("");
                    setConfirming(true);
                  }}
                >
                  <Trash2 className="size-4" />
                  {u.deleteMember}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Deleting takes the files with it, so it asks for the name to be typed.
        A second button to click is not a second thought; typing the name is.
      */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{u.deleteTitle(personName(user))}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{u.deleteWarning}</p>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={u.deleteConfirm(user.username)}
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
                    onOpenChange(false);
                    toast.success(u.deleted);
                  },
                  onError: fail,
                })
              }
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              {u.deleteAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * What one account is using and has fetched.
 *
 * Disk usage is walked from their folder rather than summed from the job rows:
 * files can be deleted, moved in from elsewhere, or left over from a job whose
 * record was removed. The two figures disagree on purpose — a file deleted
 * after download still counts as fetched — so they are labelled apart.
 */
function UserStats({
  user,
  formatWhen,
}: {
  user: User;
  formatWhen: (iso: string) => string;
}) {
  const { t, intl } = useI18n();
  const u = t.settings.users;
  const { data: stats, isLoading } = useUserStats(user.id);

  return (
    <div className="border-t pt-3">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {u.dialog.usage}
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          render={<Link href={`/history?user=${user.id}`} />}
        >
          <History className="size-4" />
          {u.viewHistory}
        </Button>
      </div>

      {isLoading || !stats ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.common.loading}</p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
          <Stat
            icon={<HardDrive className="size-3" />}
            label={u.diskUsed}
            // Someone who browses the whole library has no folder of their
            // own; repeating the instance-wide gauge here would be a number
            // about the server pretending to be about the person.
            value={
              stats.scoped ? formatBytes(stats.diskBytes, intl) : u.wholeLibrary
            }
          />
          <Stat label={u.fileCount} value={String(stats.fileCount)} />
          <Stat label={u.downloadCount} value={String(stats.total)} />
          <Stat label={u.fetched} value={formatBytes(stats.bytesFetched, intl)} />
          <Stat label={u.completedCount} value={String(stats.completed)} />
          <Stat label={u.failedCount} value={String(stats.failed)} />
          <Stat
            label={u.lastDownload}
            value={
              stats.lastDownloadAt ? formatWhen(stats.lastDownloadAt) : u.never
            }
          />
        </dl>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

function GroupsTab() {
  const { t, errorMessage } = useI18n();
  const g = t.settings.users.groups;
  const { data: groups, isLoading } = useGroups();
  const save = useSaveGroup();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const current = groups?.find((group) => group.id === editing) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4 text-primary" />
          {g.title}
        </CardTitle>
        <CardDescription>{g.hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex flex-col divide-y rounded-xl border">
            {groups?.map((group) => (
              <div
                key={group.id}
                className="flex flex-wrap items-center gap-2 px-3 py-2.5"
              >
                <span className="font-medium">{group.name}</span>
                <span className="text-xs text-muted-foreground">
                  {g.members(group.memberCount)}
                </span>
                {group.builtIn && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    {g.builtIn}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setEditing(group.id)}
                >
                  <SlidersHorizontal className="size-4" />
                  {g.edit}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={g.name}
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
            {g.newGroup}
          </Button>
        </div>
      </CardContent>

      {current && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{current.name}</DialogTitle>
            </DialogHeader>
            {/* The built-in Administrators group must keep its powers, or the
                instance can be left with nobody able to manage it. */}
            {current.id === "admin" && (
              <p className="text-xs text-muted-foreground">{g.adminLocked}</p>
            )}
            <GroupPermissionGrid
              permissions={current.permissions}
              disabled={current.id === "admin"}
              onChange={(flag, value) =>
                save.mutate(
                  { id: current.id, permissions: { [flag]: value } },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            />
            <GroupLimitGrid
              permissions={current.permissions}
              disabled={current.id === "admin"}
              onChange={(limit, value) =>
                save.mutate(
                  { id: current.id, permissions: { [limit]: value } },
                  { onError: (e) => toast.error(errorMessage(e)) },
                )
              }
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                {t.settings.users.dialog.close}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

function InvitesTab() {
  const { t, intl, errorMessage } = useI18n();
  const i = t.settings.users.invites;
  const { data: invites } = useInvites();
  const { data: groups } = useGroups();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const [groupId, setGroupId] = useState("member");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [revoking, setRevoking] = useState<Invite | null>(null);

  // Built here, not on the server: the address the administrator is reaching
  // the app on is the only one known to work, and the server cannot see the
  // public host a proxy put in front of it.
  const linkFor = (token: string) =>
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/invite/${token}`;

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      toast.success(i.copied);
    } catch {
      // Clipboard access needs a secure context, so it fails over plain HTTP —
      // exactly where a self-hosted instance often lives. The link is on
      // screen and selectable, so there is something to fall back to.
      toast.error(i.copyFailed);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4 text-primary" />
          {i.title}
        </CardTitle>
        <CardDescription>{i.hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border p-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-label" className="text-sm font-medium">
              {i.forWhom}
            </label>
            <Input
              id="invite-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={i.forWhomPlaceholder}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">{i.forWhomHint}</p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Select value={groupId} onValueChange={(v) => v && setGroupId(v)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue>
                  {(v: string) => groups?.find((g) => g.id === v)?.name ?? v}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {groups?.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-col gap-1">
              <label htmlFor="invite-uses" className="text-xs text-muted-foreground">
                {i.uses}
              </label>
              <Input
                id="invite-uses"
                type="number"
                min={1}
                max={MAX_INVITE_USES}
                value={maxUses}
                onChange={(e) =>
                  setMaxUses(
                    Math.max(
                      1,
                      Math.min(MAX_INVITE_USES, Number(e.target.value) || 1),
                    ),
                  )
                }
                className="h-9 w-20"
              />
            </div>

            <Button
              size="sm"
              className="h-9"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  { groupId, label: label.trim() || undefined, maxUses },
                  {
                    onSuccess: (created) => {
                      setLabel("");
                      setMaxUses(1);
                      void copyLink(created.token);
                    },
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              {i.create}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{i.usesHint}</p>
        </div>

        {/*
          The link lives in the row, not only in the toast it was created
          with. An invitation is something you come back to — to send it again,
          or to check what is still outstanding — and a message that disappears
          after four seconds is no place to keep the only copy.
        */}
        {!invites?.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {i.empty}
          </p>
        ) : (
          invites.map((inv) => (
            <div
              key={inv.token}
              className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("font-medium", !inv.label && "text-muted-foreground")}>
                  {inv.label ?? i.unnamed}
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {inv.groupName}
                </span>
                {/* A counter only says something when there is more than one
                    use to count. */}
                {inv.maxUses > 1 && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {i.usedCount(inv.usedCount, inv.maxUses)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {i.expires(formatDate(inv.expiresAt, intl))}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => setRevoking(inv)}
                >
                  <Trash2 className="size-4" />
                  {i.revoke}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs"
                  title={linkFor(inv.token)}
                >
                  {linkFor(inv.token)}
                </code>
                <Button
                  size="icon-sm"
                  variant="outline"
                  title={i.copyLink}
                  onClick={() => void copyLink(inv.token)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Revoking is one click next to a link someone may still be waiting
          for, and there is no undo — so it asks. */}
      <Dialog open={Boolean(revoking)} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{i.revokeTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{i.revokeWarning}</p>
          {revoking?.label && (
            <p className="text-sm font-medium">{revoking.label}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() =>
                revoking &&
                revoke.mutate(revoking.token, {
                  onSuccess: () => {
                    setRevoking(null);
                    toast.success(i.revoked);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {revoke.isPending && <Loader2 className="size-4 animate-spin" />}
              {i.revoke}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/** The audit trail: who did what, newest first. */
function AuditTab() {
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
                    <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
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

// Re-exported so the flag list has one home.
export { FLAGS };
