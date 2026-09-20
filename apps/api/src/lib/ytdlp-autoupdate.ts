import { getSetting, setSetting } from "../db.js";
import { ytdlpUpdate } from "./ytdlp-system.js";

/**
 * Keeps yt-dlp current on its own.
 *
 * yt-dlp is the part that breaks: platforms change something and a build a few
 * weeks old stops downloading anything. In a container the usual answer — pull
 * a fresh image — is slower than the problem, so the running instance checks
 * for itself, once at boot and then daily.
 *
 * Updates are lost when the container is recreated, which is fine: the image
 * itself is rebuilt nightly, so a recreated container never falls far behind.
 */

const KEY = "autoUpdateYtdlp";
const LAST_CHECK_KEY = "ytdlpLastCheckedAt";
const EVERY_MS = 24 * 60 * 60 * 1000;

/** When yt-dlp was last checked, however the check was triggered. */
export function lastCheckedAt(): string | null {
  return getSetting(LAST_CHECK_KEY) ?? null;
}

export function recordCheck(): void {
  setSetting(LAST_CHECK_KEY, new Date().toISOString());
}

/** Enabled unless explicitly turned off. */
export function isAutoUpdateEnabled(): boolean {
  return getSetting(KEY) !== "false";
}

export function setAutoUpdateEnabled(enabled: boolean): boolean {
  setSetting(KEY, enabled ? "true" : "false");
  return enabled;
}

let timer: ReturnType<typeof setInterval> | null = null;

async function runOnce(log: (msg: string) => void): Promise<void> {
  if (!isAutoUpdateEnabled()) return;
  try {
    const { ok, output } = await ytdlpUpdate();
    recordCheck();
    // yt-dlp says so itself when nothing changed; only report real updates.
    if (ok && !/is up to date/i.test(output)) {
      log(`yt-dlp updated: ${output.trim().split("\n").pop() ?? ""}`);
    }
  } catch {
    // Never let a failed check take the server down with it — a stale yt-dlp
    // still works for most downloads, and the Settings page has a manual
    // button when it does not.
  }
}

export function startYtdlpAutoUpdate(log: (msg: string) => void): void {
  if (timer) return;
  // Detached from startup: the server must not wait on the network to listen.
  void runOnce(log);
  timer = setInterval(() => void runOnce(log), EVERY_MS);
  // Do not hold the process open just for this.
  timer.unref?.();
}
