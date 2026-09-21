import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";

/**
 * Stopping a yt-dlp run and everything it started.
 *
 * yt-dlp is a launcher as much as a downloader: during a merge or an audio
 * conversion the real work happens in an ffmpeg it spawned. Killing only
 * yt-dlp left that ffmpeg running, holding the stdout it inherited — so the
 * process never reported as closed, the job stayed "downloading" forever, and
 * cancelling appeared to do nothing at all.
 *
 * The decision of *how* to kill is a pure function so it can be tested on any
 * platform; the actual signalling is the thin wrapper below it.
 */

export type KillPlan =
  | { kind: "taskkill"; command: string; args: string[] }
  | { kind: "group"; signalPid: number };

/**
 * What it takes to kill this pid and its descendants on a given platform.
 *
 * Windows has no process group to signal, so the tree is walked by pid:
 * `/t` includes the children, `/f` does not ask them nicely. Elsewhere the
 * child was spawned detached, which gave it a group of its own, and a negative
 * pid signals that whole group — the ffmpeg included.
 */
export function killPlan(platform: NodeJS.Platform, pid: number): KillPlan {
  if (platform === "win32") {
    return {
      kind: "taskkill",
      command: "taskkill",
      args: ["/pid", String(pid), "/t", "/f"],
    };
  }
  return { kind: "group", signalPid: -pid };
}

/**
 * Kill a child and its descendants, best effort.
 *
 * Never throws: the caller is cancelling a download, and a process that has
 * already died is the outcome it wanted anyway.
 */
export function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  const plan = killPlan(process.platform, pid);

  if (plan.kind === "taskkill") {
    // Only as a fallback, and only once taskkill has answered. Killing the
    // child up front looked harmless and was the whole bug: taskkill resolves
    // the tree from the live process list, so a parent that is already dead
    // leaves its ffmpeg orphaned — and the download ran happily to completion
    // after the user had cancelled it.
    execFile(plan.command, plan.args, { windowsHide: true }, (err) => {
      if (err) child.kill("SIGKILL");
    });
    return;
  }

  try {
    process.kill(plan.signalPid, "SIGKILL");
  } catch {
    // No group, or it is already gone: fall back to the child itself.
    child.kill("SIGKILL");
  }
}
