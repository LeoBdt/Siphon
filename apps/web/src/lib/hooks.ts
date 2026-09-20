"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AppSettings,
  CleanupResult,
  CreateDownloadRequest,
  DiskUsage,
  DownloadJob,
  ListDirResponse,
  VideoInfo,
  YtdlpInfo,
  YtdlpUpdateResult,
} from "@app/shared";
import { apiFetch, apiUrl } from "./api";

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

export function useDownloads() {
  return useQuery({
    queryKey: ["downloads"],
    queryFn: () => apiFetch<DownloadJob[]>("/api/downloads"),
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
    mutationFn: (id: string) =>
      fetch(apiUrl(`/api/downloads/${id}`), { method: "DELETE" }).then((r) => {
        if (!r.ok && r.status !== 204) throw new Error("Delete failed");
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["downloads"] }),
  });
}

// ---------------------------------------------------------------------------
// File manager
// ---------------------------------------------------------------------------

export function useFiles(path: string) {
  return useQuery({
    queryKey: ["files", path],
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
      fetch(apiUrl(`/api/files?path=${encodeURIComponent(path)}`), {
        method: "DELETE",
      }).then((r) => {
        if (!r.ok && r.status !== 204) throw new Error("Delete failed");
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
