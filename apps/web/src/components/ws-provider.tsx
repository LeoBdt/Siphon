"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DownloadJob, WsServerMessage } from "@app/shared";
import { wsUrl } from "@/lib/api";
import { useT } from "@/components/i18n-provider";
import { isRickRoll } from "@/lib/easter-eggs";

/**
 * Maintains a single WebSocket to the API and pushes job updates straight into
 * the React Query cache so progress bars move in real time without polling.
 * Reconnects automatically if the socket drops.
 */
export function WsProvider({ children }: { children: ReactNode }) {
  const t = useT();
  // Read through a ref inside the socket handler: keeping the dictionary in
  // the effect's dependencies tore the connection down and rebuilt it every
  // time the interface language changed.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const qc = useQueryClient();
  const statusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      socket = new WebSocket(wsUrl("/ws"));

      socket.onmessage = (ev) => {
        let msg: WsServerMessage;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (msg.type !== "job:update") return;
        const job = msg.job;

        const prevStatus = statusRef.current.get(job.id);
        const changed = prevStatus !== job.status;
        if (changed) statusRef.current.set(job.id, job.status);

        // Toast on meaningful status transitions (top-level jobs only).
        if (!job.playlistId && changed && prevStatus) {
          if (job.status === "completed") {
            toast.success(
              isRickRoll(job.url)
                ? tRef.current.rick.toast
                : tRef.current.toast.jobDone(job.title ?? job.url),
            );
          } else if (job.status === "error") {
            toast.error(tRef.current.toast.jobFailed(job.title ?? job.url));
          }
        }

        // A finished download puts a new file in the library — refresh the
        // explorer so it appears without the user hitting Refresh. Playlist
        // children count too: each one writes its own file.
        if (changed && job.status === "completed") {
          qc.invalidateQueries({ queryKey: ["files"] });
          qc.invalidateQueries({ queryKey: ["disk"] });
        }

        // Merge into the downloads list cache.
        qc.setQueryData<DownloadJob[]>(["downloads"], (old) => {
          if (!old) return old;
          if (job.playlistId) return old; // children aren't in the top-level list
          const idx = old.findIndex((j) => j.id === job.id);
          if (idx === -1) return [job, ...old];
          const next = [...old];
          next[idx] = job;
          return next;
        });
      };

      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500);
      };
      socket.onerror = () => socket?.close();
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [qc]);

  return <>{children}</>;
}
