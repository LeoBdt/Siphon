"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DownloadJob, WsServerMessage } from "@app/shared";
import { wsUrl } from "@/lib/api";
import { useAuthState } from "@/lib/hooks";
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
  // Nothing to listen to before there is a session. The socket sits above the
  // sign-in screen, so it used to open as an anonymous visitor: the server
  // refused the upgrade, the browser logged "bad response from server", and
  // the retry below turned that into one error every 1.5 seconds.
  const { data: auth } = useAuthState();
  const signedIn = Boolean(auth?.user);

  useEffect(() => {
    if (!signedIn) return;
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

        // Merge into every cached downloads list — there is one per scope now
        // that an administrator can narrow the view to a single member.
        for (const query of qc.getQueryCache().findAll({ queryKey: ["downloads"] })) {
          const old = query.state.data as DownloadJob[] | undefined;
          if (!old) continue;

          // A playlist entry is never in the top-level list: it lives in its
          // parent's `children`, which only the lists that asked for them
          // carry — today, the file manager's.
          if (job.playlistId) {
            const at = old.findIndex((j) => j.id === job.playlistId);
            const entries = at === -1 ? undefined : old[at].children;
            if (!entries) continue;
            const next = [...old];
            next[at] = {
              ...next[at],
              children: entries.map((c) => (c.id === job.id ? job : c)),
            };
            qc.setQueryData(query.queryKey, next);
            continue;
          }

          const idx = old.findIndex((j) => j.id === job.id);
          if (idx !== -1) {
            const next = [...old];
            // Keep the entries this list already holds: a parent's own update
            // carries its progress and its tallies, never its children.
            next[idx] = { ...job, children: old[idx].children };
            qc.setQueryData(query.queryKey, next);
            continue;
          }
          // A job this list has never seen. Only the unfiltered list can be
          // certain it belongs there; a list narrowed to one member would have
          // to know whose job it is, so it refetches rather than guesses.
          if (query.queryKey[1] === "all") {
            qc.setQueryData(query.queryKey, [job, ...old]);
          } else {
            void qc.invalidateQueries({ queryKey: query.queryKey });
          }
        }
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
  }, [qc, signedIn]);

  return <>{children}</>;
}
