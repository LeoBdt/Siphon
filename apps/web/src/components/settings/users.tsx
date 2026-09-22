"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Copy,
  HardDrive,
  History,
  KeyRound,
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
import type {
  AuditEntry,
  Group,
  Permissions,
  Invite,
  PermissionOverrides,
  User,
} from "@app/shared";
import { MAX_DISPLAY_NAME, MAX_INVITE_USES } from "@app/shared";
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
import type { Dictionary } from "@/lib/i18n";
import {
  useAudit,
  useAuthState,
  useCreateInvite,
  useDeleteGroup,
  useDeleteUser,
  useGroups,
  useInvites,
  useRevokeInvite,
  useSaveGroup,
  useSaveUser,
  useSuspendUser,
  useRecordPublicUrl,
  useResetLink,
  useUnlockUser,
  useUsers,
  useUserStats,
} from "@/lib/hooks";
import { formatBytes, formatDate } from "@/lib/format";
import { personName } from "@/lib/people";
import { groupName, groupNameById } from "@/lib/groups";
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
// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

type StatusFilter = "any" | "active" | "suspended" | "locked" | "admins";

export function UsersTab() {
  const { t, intl } = useI18n();
  // Told once, from the one page an administrator is sure to open: the
  // command-line reset tool has no browser, so this is how it learns the
  // address to print in a link.
  useRecordPublicUrl(true);
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
      return [
        user.displayName,
        user.username,
        groupNameById(user.groupId, t) ?? user.groupName,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [users, query, groupId, status, t]);

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
        {groupNameById(user.groupId, t) ?? user.groupName}
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
 * The two names an account has, editable by an administrator.
 *
 * Held in local state and saved on demand rather than on every keystroke:
 * a username is unique, and sending each intermediate spelling would collide
 * with other accounts on the way to a perfectly good one.
 */
/**
 * The name and username, held in the dialog's draft.
 *
 * It used to carry its own Save button while everything below it saved on
 * change — two different contracts in one form, and no way to tell which half
 * you had committed.
 */
function IdentityFields({
  username,
  displayName,
  onChange,
}: {
  username: string;
  displayName: string;
  onChange: (patch: { username?: string; displayName?: string }) => void;
}) {
  const { t } = useI18n();
  const u = t.settings.users;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{u.dialog.identity}</h4>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t.settings.profile.displayName}
          <Input
            value={displayName}
            maxLength={MAX_DISPLAY_NAME}
            onChange={(e) => onChange({ displayName: e.target.value })}
            className="h-9"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t.settings.profile.username}
          <Input
            value={username}
            onChange={(e) => onChange({ username: e.target.value })}
            className="h-9"
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{u.dialog.identityHint}</p>
    </div>
  );
}

/** The editable state of one account, before it is sent. */
interface UserDraft {
  username: string;
  displayName: string;
  groupId: string;
  overrides: PermissionOverrides;
}

function draftOf(user: User): UserDraft {
  return {
    username: user.username,
    displayName: user.displayName ?? "",
    groupId: user.groupId,
    overrides: { ...(user.overrides as PermissionOverrides) },
  };
}

/** Whether anything in the draft differs from the account it came from. */
function draftDiffers(draft: UserDraft, user: User): boolean {
  return JSON.stringify(draft) !== JSON.stringify(draftOf(user));
}

/**
 * Everything about one account, in a dialog.
 *
 * Edited as a draft and saved on purpose. It used to write every change
 * straight to the server, which looked like nothing was happening — no button
 * to press, no confirmation, and a mis-click applied before you could see it.
 * Now the form holds the change, the footer says there is one, and closing
 * with something pending asks rather than deciding for you.
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
  const resetLink = useResetLink();
  const remove = useDeleteUser();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  /** Asked when closing would throw away an unsaved change. */
  const [leaving, setLeaving] = useState(false);
  /** Whether the form should close once that question has left the screen. */
  const closeAfter = useRef(false);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  // Follow the account the dialog was opened on, and any change made to it
  // elsewhere — but never while it is being edited here.
  const [syncedId, setSyncedId] = useState<string | null>(null);
  if (user && syncedId !== user.id) {
    setSyncedId(user.id);
    setDraft(draftOf(user));
    // Cleared with the account: a footer left asking about unsaved changes
    // would greet whoever opens the next one.
    setLeaving(false);
  }
  // The issued link, held so it can be read and sent rather than caught in a
  // toast. Cleared with the dialog: it is one account's link, not the page's.
  const [link, setLink] = useState<string | null>(null);

  if (!user || !draft) return null;
  const group = groups.find((g) => g.id === draft.groupId);
  const fail = (e: unknown) => toast.error(errorMessage(e));
  const dirty = draftDiffers(draft, user);
  const edit = (patch: Partial<UserDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const setOverride = (key: string, value: boolean | number | null | undefined) =>
    setDraft((d) =>
      d ? { ...d, overrides: { ...d.overrides, [key]: value ?? null } } : d,
    );

  function commit(then?: () => void) {
    if (!user || !draft) return;
    save.mutate(
      {
        id: user.id,
        username: draft.username.trim(),
        displayName: draft.displayName.trim() || null,
        groupId: draft.groupId,
        overrides: draft.overrides,
      },
      {
        onSuccess: () => {
          toast.success(u.saved);
          setLeaving(false);
          then?.();
        },
        onError: fail,
      },
    );
  }

  /** Closing: ask first when something would be lost. */
  function requestClose() {
    if (dirty) setLeaving(true);
    else onOpenChange(false);
  }

  return (
    <>
      <Dialog open onOpenChange={(o: boolean) => !o && requestClose()}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-2xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex flex-wrap items-baseline gap-2">
              {personName(user)}
              <span className="text-sm font-normal text-muted-foreground">
                @{user.username}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Only this scrolls, so the name of whoever is being edited — and
              the way out — stay where they were put. */}
          <div className="scroll-panel -mr-2 flex flex-1 flex-col gap-5 overflow-y-auto pr-2">

          {/* What you came to do, at the top. These were at the bottom, under
              a permission list and a usage table — so reaching the button for
              a locked-out colleague meant scrolling past everything else. */}
          <div className="flex flex-wrap gap-2">
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

            {/* A link, never a password: an administrator has no business
                holding someone else's credentials, and on an instance with
                private folders that is not a detail. */}
            <Button
              size="sm"
              variant="outline"
              disabled={resetLink.isPending || Boolean(link)}
              onClick={() =>
                resetLink.mutate(user.id, {
                  onSuccess: async ({ token }) => {
                    const url = `${window.location.origin}/reset/${token}`;
                    setLink(url);
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success(u.resetLinkCopied);
                    } catch {
                      // Clipboard access needs a secure context, absent on the
                      // plain-HTTP LAN deployments this app often lives on. The
                      // link is on screen and selectable either way.
                    }
                  },
                  onError: fail,
                })
              }
            >
              {resetLink.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              {u.resetPassword}
            </Button>

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
                  variant="outline"
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
          </div>

          {/* The link itself, not only a toast that is gone in four seconds:
              it has to be sent to someone, which takes longer than that. */}
          {link && (
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <code className="scroll-panel flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs">
                  {link}
                </code>
                <Button
                  size="icon-sm"
                  variant="outline"
                  title={u.invites.copyLink}
                  onClick={() => void navigator.clipboard?.writeText(link)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{u.resetLinkHint}</p>
              {/* Issuing another one drops this: the server keeps a single
                  live link per account, so two messages can never both work. */}
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => setLink(null)}
              >
                <KeyRound className="size-4" />
                {u.resetLinkAgain}
              </Button>
            </div>
          )}

          <IdentityFields
              username={draft.username}
              displayName={draft.displayName}
              onChange={edit}
            />

          <div className="flex flex-col gap-1.5">
            <h4 className="text-sm font-semibold">{u.dialog.group}</h4>
            <Select
              value={draft.groupId}
              onValueChange={(v: string | null) => v && edit({ groupId: v })}
            >
              <SelectTrigger className="h-9 bg-background">
                <SelectValue>
                  {(v: string) => groupName(groups.find((g) => g.id === v), t, v)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {groupName(g, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{u.dialog.groupHint}</p>
          </div>

          {/* Two different kinds of rule, so two headings: what this person may
              do, and how much of it. They used to run together under one. */}
          <div>
            <h4 className="mb-1 text-sm font-semibold">
              {u.dialog.permissions}
            </h4>
            <UserPermissionGrid
              group={group}
              effective={user.effective}
              overrides={draft.overrides}
              onChange={(flag: Flag, value) => setOverride(flag, value)}
            />
          </div>

          <div>
            <h4 className="mb-1 text-sm font-semibold">{u.dialog.limits}</h4>
            <UserLimitGrid
              group={group}
              effective={user.effective}
              overrides={draft.overrides}
              // undefined means "inherit", which the API stores as null — the
              // same shape the boolean overrides use.
              onChange={(limit: Limit, value) => setOverride(limit, value)}
            />
          </div>

            <UserStats user={user} formatWhen={formatWhen} />
          </div>

          {/* Outside the scrolling body, so it is reachable from anywhere in a
              long form — and so it can say there is something to save without
              having to be scrolled to. */}
          <DialogFooter className="border-t pt-3">
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {dirty ? u.dialog.unsaved : ""}
            </span>
            <Button variant="outline" onClick={requestClose}>
              {t.common.cancel}
            </Button>
            {/* Saving is finishing: there is nothing left to do in the form,
                and leaving it open invited a second look for a change that had
                already been applied. */}
            <Button
              disabled={!dirty || !draft.username.trim() || save.isPending}
              onClick={() => commit(() => onOpenChange(false))}
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Closing with something pending. Three ways out rather than two: the
        usual mistake is meaning to close and losing the edit, and the usual
        fix is offering to save it on the way.

        The form underneath is closed from `onOpenChangeComplete` — once this
        one has actually finished leaving — and never in the same breath.
        Tearing down two overlays together left the page blocked for as long
        as the outgoing one animated, which is seconds of a reopened form
        refusing every click.
      */}
      <Dialog
        open={leaving}
        onOpenChange={setLeaving}
        onOpenChangeComplete={(open: boolean) => {
          if (open || !closeAfter.current) return;
          closeAfter.current = false;
          onOpenChange(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{u.dialog.unsavedTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{u.dialog.unsavedWarning}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaving(false)}>
              {u.dialog.keepEditing}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setDraft(draftOf(user));
                closeAfter.current = true;
                setLeaving(false);
              }}
            >
              {u.dialog.discard}
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                commit(() => {
                  closeAfter.current = true;
                  setLeaving(false);
                })
              }
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Deleting takes the files with it, so it asks for the name to be typed.
        A second button to click is not a second thought; typing the name is.
      */}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        // The same sequencing: the account is gone, but this overlay leaves
        // before the form behind it does.
        onOpenChangeComplete={(open: boolean) => {
          if (open || !closeAfter.current) return;
          closeAfter.current = false;
          onOpenChange(false);
        }}
      >
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
                    closeAfter.current = true;
                    setConfirming(false);
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
        {/* The same weight as every other heading in this dialog: it was the
            one section title in small grey capitals, which read as a footnote
            rather than as a peer of "Identity" and "Limits". */}
        <h4 className="text-sm font-semibold">{u.dialog.usage}</h4>
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
              formatBytes(stats.diskBytes, intl)
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

export function GroupsTab() {
  const { t, errorMessage } = useI18n();
  const g = t.settings.users.groups;
  const { data: groups, isLoading } = useGroups();
  const save = useSaveGroup();
  const removeGroup = useDeleteGroup();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const current = groups?.find((group) => group.id === editing) ?? null;

  /**
   * The group's permissions as they are being edited.
   *
   * Like the account dialog, and for the same reason: a group edit moves
   * everyone in it at once, which is the last place that should happen on a
   * stray click with no button pressed.
   */
  const [groupDraft, setGroupDraft] = useState<Permissions | null>(null);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const closeGroupAfter = useRef(false);
  const [syncedGroup, setSyncedGroup] = useState<string | null>(null);
  if (current && syncedGroup !== current.id) {
    setSyncedGroup(current.id);
    setGroupDraft({ ...current.permissions });
    setLeavingGroup(false);
  }

  const groupDirty =
    current != null &&
    groupDraft != null &&
    JSON.stringify(groupDraft) !== JSON.stringify(current.permissions);

  const editGroup = (patch: Partial<Permissions>) =>
    setGroupDraft((d) => (d ? { ...d, ...patch } : d));

  function commitGroup(then?: () => void) {
    if (!current || !groupDraft) return;
    save.mutate(
      { id: current.id, permissions: groupDraft },
      {
        onSuccess: () => {
          toast.success(t.settings.users.saved);
          setLeavingGroup(false);
          then?.();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  function requestCloseGroup() {
    if (groupDirty) setLeavingGroup(true);
    else setEditing(null);
  }

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
                <span className="font-medium">{groupName(group, t)}</span>
                <span className="text-xs text-muted-foreground">
                  {g.members(group.memberCount)}
                </span>

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
        <Dialog
          open
          onOpenChange={(open: boolean) => !open && requestCloseGroup()}
        >
          <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-2xl">
            <DialogHeader className="pr-8">
              <DialogTitle>{groupName(current, t)}</DialogTitle>
            </DialogHeader>

            {/* At the top, where the user dialog keeps its actions: what you
                can do to the thing comes before its settings. */}
            {!current.builtIn && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  disabled={current.memberCount > 0 || removeGroup.isPending}
                  title={
                    current.memberCount > 0 ? g.deleteGroupBlocked : undefined
                  }
                  onClick={() =>
                    removeGroup.mutate(current.id, {
                      onSuccess: () => {
                        setEditing(null);
                        toast.success(g.groupDeleted);
                      },
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                  {g.deleteGroup}
                </Button>
              </div>
            )}

            <div className="scroll-panel -mr-2 flex flex-1 flex-col gap-5 overflow-y-auto pr-2">
            {/* The built-in Administrators group must keep its powers, or the
                instance can be left with nobody able to manage it. */}
            {current.id === "admin" ? (
              <p className="text-xs text-muted-foreground">{g.adminLocked}</p>
            ) : current.builtIn ? (
              <p className="text-xs text-muted-foreground">{g.builtInHint}</p>
            ) : null}
            {/* Two headings, because these are two different kinds of rule:
                what the group's members may do, and how much of it. Run
                together, the quota rows read as more permissions. */}
            <div>
              <h4 className="mb-1 text-sm font-semibold">
                {t.settings.users.dialog.permissions}
              </h4>
              <GroupPermissionGrid
                permissions={groupDraft ?? current.permissions}
                disabled={current.id === "admin"}
                onChange={(flag, value) => editGroup({ [flag]: value })}
              />
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold">
                {t.settings.users.dialog.limits}
              </h4>
              <GroupLimitGrid
                permissions={groupDraft ?? current.permissions}
                disabled={current.id === "admin"}
                onChange={(limit, value) => editGroup({ [limit]: value })}
              />
              </div>
            </div>
            <DialogFooter className="border-t pt-3">
              <span className="mr-auto self-center text-xs text-muted-foreground">
                {groupDirty ? t.settings.users.dialog.unsaved : ""}
              </span>
              <Button variant="outline" onClick={requestCloseGroup}>
                {t.common.cancel}
              </Button>
              <Button
                disabled={!groupDirty || save.isPending}
                onClick={() => commitGroup(() => setEditing(null))}
              >
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {t.common.save}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Sequenced like the account dialog's: this one leaves first, and the
          form underneath closes only once it has. */}
      <Dialog
        open={leavingGroup}
        onOpenChange={setLeavingGroup}
        onOpenChangeComplete={(open: boolean) => {
          if (open || !closeGroupAfter.current) return;
          closeGroupAfter.current = false;
          setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.settings.users.dialog.unsavedTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.settings.users.dialog.unsavedWarning}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeavingGroup(false)}>
              {t.settings.users.dialog.keepEditing}
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (current) setGroupDraft({ ...current.permissions });
                closeGroupAfter.current = true;
                setLeavingGroup(false);
              }}
            >
              {t.settings.users.dialog.discard}
            </Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                commitGroup(() => {
                  closeGroupAfter.current = true;
                  setLeavingGroup(false);
                })
              }
            >
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export function InvitesTab() {
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
          {/* A link several people will use is addressed to nobody, so there
              is no name to ask for — and the greeting on it says "Leo invites
              you" rather than naming someone who is not the only recipient.
              Dimmed rather than removed: the field vanishing as the count
              passed one was abrupt, and it took the typed name with it. It
              stays where it was, says why it is unavailable, and remembers
              what was in it. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-label" className="text-sm font-medium">
              {i.forWhom}
            </label>
            {/* The field is what becomes unavailable, so the field is what
                dims. Fading the explanation along with it made the one thing
                worth reading the hardest thing to read. */}
            <Input
              id="invite-label"
              value={label}
              disabled={maxUses > 1}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={i.forWhomPlaceholder}
              className={cn(
                "transition-opacity duration-200",
                maxUses > 1 && "opacity-50",
              )}
            />
            <p
              className={cn(
                "text-xs",
                maxUses > 1 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {maxUses > 1 ? i.forWhomShared : i.forWhomHint}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="invite-group" className="text-xs text-muted-foreground">
                {i.group}
              </label>
              <Select value={groupId} onValueChange={(v) => v && setGroupId(v)}>
              <SelectTrigger id="invite-group" className="h-9 w-44">
                <SelectValue>
                  {(v: string) => groupName(groups?.find((g) => g.id === v), t, v)}
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
            </div>

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
              className="h-9"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  {
                    groupId,
                    label: maxUses === 1 ? label.trim() || undefined : undefined,
                    maxUses,
                  },
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
export function ActivityTab() {
  const { t } = useI18n();
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
          <div className="scroll-panel max-h-96 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {entries.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One line of the log, with what it changed underneath.
 *
 * "Somebody edited a group" is where the question starts, not where it ends,
 * and until the server recorded the fields there was nothing to show. Folded
 * away by default: a log is read by scanning it, and a row that always shows
 * six permission changes is a row nobody scans past.
 */
function ActivityRow({ entry }: { entry: AuditEntry }) {
  const { t, intl } = useI18n();
  const a = t.settings.audit;
  const [open, setOpen] = useState(false);
  const changes = entry.details ?? [];

  return (
    <>
      <tr className={cn("border-b last:border-0", open && "border-b-0")}>
        <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
          {formatDate(entry.at, intl)}
        </td>
        <td className="px-3 py-2">
          {changes.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 text-left transition-colors hover:text-primary"
            >
              <ChevronDown
                className={cn(
                  "size-3 shrink-0 transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
              {a.actions[entry.action]}
              <span className="text-xs text-muted-foreground">
                {a.changeCount(changes.length)}
              </span>
            </button>
          ) : (
            a.actions[entry.action]
          )}
        </td>
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
      {open && (
        <tr className="border-b last:border-0">
          <td colSpan={4} className="px-3 pb-2">
            <ul className="flex flex-col gap-1 border-l-2 border-primary/30 pl-3 text-xs">
              {changes.map((change, i) => (
                <li key={`${change.field}-${i}`} className="flex flex-wrap gap-1.5">
                  <span className="font-medium">{auditFieldName(change.field, t)}</span>
                  <span className="text-muted-foreground line-through">
                    {auditValue(change.field, change.from, t, intl)}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span>{auditValue(change.field, change.to, t, intl)}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * A recorded value, said the way the form said it.
 *
 * The server stores what it had — a number of bytes, a boolean, or nothing —
 * because a register must not depend on today's wording. But "nothing" means
 * something different in every row: for a permission it is the group's answer,
 * for a quota it is no limit at all, and for simultaneous downloads it is the
 * instance's own figure. Printing "unset" for all three said none of them.
 */
function auditValue(
  field: string,
  value: string | null,
  t: Dictionary,
  intl: string,
): string {
  const u = t.settings.users;
  if (value === null) {
    if (field === "maxConcurrentDownloads") return u.limits.instanceSetting;
    if (field === "quotaBytes" || field === "maxFileSizeBytes") {
      return u.limits.unlimited;
    }
    if (field in u.permissions) return t.settings.audit.inherited;
    return t.settings.audit.unset;
  }
  // Bytes are stored as bytes and read by people in gigabytes.
  if (field === "quotaBytes" || field === "maxFileSizeBytes") {
    return formatBytes(Number(value), intl);
  }
  if (value === "true") return t.settings.audit.allowed;
  if (value === "false") return t.settings.audit.denied;
  return value;
}

/**
 * A field's name, in the interface's own words.
 *
 * The server records raw keys on purpose — it has no business knowing the
 * language this is read in — so the translation happens here, falling back to
 * the key itself for anything recorded before this list knew about it.
 */
function auditFieldName(field: string, t: Dictionary): string {
  const u = t.settings.users;
  if (field in u.permissions) {
    return u.permissions[field as keyof typeof u.permissions] as string;
  }
  if (field in u.limits) {
    return u.limits[field as keyof typeof u.limits] as string;
  }
  const extra = t.settings.audit.fields as Record<string, string>;
  return extra[field] ?? field;
}

// Re-exported so the flag list has one home.
export { FLAGS };
