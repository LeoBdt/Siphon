"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AppSettings,
  AuditEntry,
  AuthState,
  Invite,
  Credentials,
  Group,
  PermissionOverrides,
  Permissions,
  User,
  UserStats,
  CleanupResult,
  CreateDownloadRequest,
  DiskUsage,
  DownloadJob,
  ReleaseCheck,
  ListDirResponse,
  VideoInfo,
  YtdlpInfo,
  YtdlpUpdateResult,
} from "@app/shared";
import { apiFetch } from "./api";

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

/**
 * Jobs, optionally narrowed to one member.
 *
 * `scope` is only honoured for an administrator — the server pins everyone
 * else to their own id whatever is asked, so this is a view control rather
 * than a permission. "all" and "mine" are spelled out instead of using an
 * empty string, which would be indistinguishable from "not chosen yet".
 */
export type JobScope = "all" | "mine" | { userId: string };

export function useDownloads(scope: JobScope = "all") {
  const userId =
    typeof scope === "object" ? scope.userId : scope === "mine" ? "me" : null;
  return useQuery({
    queryKey: ["downloads", userId ?? "all"],
    queryFn: () =>
      apiFetch<DownloadJob[]>(
        userId ? `/api/downloads?userId=${encodeURIComponent(userId)}` : "/api/downloads",
      ),
  });
}

export function useProbe(url: string, enabled: boolean) {
  return useQuery({
    queryKey: ["probe", url],
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () =>
      apiFetch<VideoInfo>(
        `/api/downloads/info?url=${encodeURIComponent(url)}`,
      ),
  });
}

export function useCreateDownload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDownloadRequest) =>
      apiFetch<DownloadJob>("/api/downloads", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["downloads"] }),
  });
}

type JobAction = "retry" | "cancel";

export function useJobAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: JobAction }) =>
      apiFetch<DownloadJob>(`/api/downloads/${id}/${action}`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["downloads"] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    // Through apiFetch like everything else: a bare fetch sent no CSRF header
    // and no credentials, which the server is entitled to refuse. It only
    // bypassed apiFetch because a 204 used to make it throw.
    mutationFn: (id: string) =>
      apiFetch(`/api/downloads/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["downloads"] }),
  });
}

// ---------------------------------------------------------------------------
// File manager
// ---------------------------------------------------------------------------

export function useFiles(path: string) {
  return useQuery({
    queryKey: ["files", path],
    // A directory listing is the one thing here that changes without this
    // browser doing anything: an administrator drops a file into someone's
    // folder, or removes one. Under the default 30-second staleTime, leaving
    // the page and coming back served the cache, so the file appeared to
    // linger after deletion and a new one stayed invisible. The listing is
    // cheap, so it is refetched whenever it is looked at again.
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () =>
      apiFetch<ListDirResponse>(
        `/api/files?path=${encodeURIComponent(path)}`,
      ),
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, name }: { path: string; name: string }) =>
      apiFetch("/api/files/folder", {
        method: "POST",
        body: JSON.stringify({ path, name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });
}

export function useMoveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      apiFetch("/api/files", {
        method: "PATCH",
        body: JSON.stringify({ from, to }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      apiFetch(`/api/files?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });
}

// ---------------------------------------------------------------------------
// Settings & system
// ---------------------------------------------------------------------------

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<AppSettings>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    // Partial on purpose: each card sends only the field it owns, so saving one
    // setting never overwrites another card's value with a stale copy.
    mutationFn: (body: Partial<AppSettings>) =>
      apiFetch<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}

export function useCleanup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<CleanupResult>("/api/system/cleanup", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["disk"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

export function useDiskUsage() {
  return useQuery({
    queryKey: ["disk"],
    refetchInterval: 30_000,
    queryFn: () => apiFetch<DiskUsage>("/api/system/disk"),
  });
}

export function useYtdlpInfo() {
  return useQuery({
    queryKey: ["ytdlp"],
    queryFn: () => apiFetch<YtdlpInfo>("/api/system/ytdlp"),
  });
}

/**
 * Ask GitHub whether a newer Siphon exists.
 *
 * A mutation rather than a query on purpose: this is the one call that leaves
 * the machine, so it must never fire because a page was rendered.
 */
export function useReleaseCheck() {
  return useMutation({
    mutationFn: () =>
      apiFetch<ReleaseCheck>("/api/system/release-check", { method: "POST" }),
  });
}

export function useUpdateYtdlp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<YtdlpUpdateResult>("/api/system/ytdlp/update", {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ytdlp"] }),
  });
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function useAuthState() {
  return useQuery({
    queryKey: ["auth"],
    // Never cached: this decides whether the app is reachable at all.
    staleTime: 0,
    retry: false,
    queryFn: () => apiFetch<AuthState>("/api/auth/state"),
  });
}

function useAuthMutation(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Credentials & { code?: string }) =>
      apiFetch<User>(path, { method: "POST", body: JSON.stringify(body) }),
    // Everything on screen was fetched as the previous visitor — or as nobody.
    onSuccess: () => qc.invalidateQueries(),
  });
}

export const useLogin = () => useAuthMutation("/api/auth/login");
export const useSetup = () => useAuthMutation("/api/auth/setup");

export function useDismissNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/notice/dismiss", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useUsers(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["users"],
    // Administrators only. Callers that render for everyone pass `enabled` so
    // a member does not fire a request that can only come back refused.
    enabled: opts.enabled ?? true,
    queryFn: () => apiFetch<User[]>("/api/admin/users"),
  });
}

/** What one member is using and has fetched. Administrators only. */
export function useUserStats(userId: string | null) {
  return useQuery({
    queryKey: ["user-stats", userId],
    enabled: Boolean(userId),
    queryFn: () => apiFetch<UserStats>(`/api/admin/users/${userId}/stats`),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => apiFetch<Group[]>("/api/admin/groups"),
  });
}

interface UserPayload {
  username?: string;
  password?: string;
  groupId?: string;
  overrides?: Partial<PermissionOverrides>;
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UserPayload & { id?: string }) =>
      apiFetch<User>(id ? `/api/admin/users/${id}` : "/api/admin/users", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["auth"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    // Through apiFetch, like every other call: a bare fetch sends no CSRF
    // header, and the server refuses a state-changing request without one —
    // which is why deleting a member answered 403 however many times it was
    // tried. See the same fix on useDeleteJob.
    mutationFn: (id: string) => apiFetch(`/api/admin/users/${id}`, {
      method: "DELETE",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
  });
}

export function useSaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      name?: string;
      permissions?: Partial<Permissions>;
    }) =>
      apiFetch<Group>(id ? `/api/admin/groups/${id}` : "/api/admin/groups", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useInvites() {
  return useQuery({
    queryKey: ["invites"],
    queryFn: () => apiFetch<Invite[]>("/api/admin/invites"),
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) =>
      apiFetch<Invite>("/api/admin/invites", {
        method: "POST",
        body: JSON.stringify({ groupId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    // Same as useDeleteUser above: without apiFetch there is no CSRF header,
    // and revoking an invitation always came back 403.
    mutationFn: (token: string) =>
      apiFetch(`/api/admin/invites/${token}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });
}

/** Turn one's own folder privacy on or off. */
export function useSetPrivateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch<User>("/api/auth/private-folder", {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      apiFetch<User>(`/api/admin/users/${id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ suspended }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useAudit() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => apiFetch<AuditEntry[]>("/api/admin/audit?limit=100"),
  });
}

export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<User>(`/api/admin/users/${id}/unlock`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useTotpSetup() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ secret: string; uri: string }>("/api/auth/totp/setup", {
        method: "POST",
      }),
  });
}

export function useTotpEnable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch("/api/auth/totp/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth"] }),
  });
}

export function useTotpDisable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      apiFetch("/api/auth/totp/disable", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth"] }),
  });
}
