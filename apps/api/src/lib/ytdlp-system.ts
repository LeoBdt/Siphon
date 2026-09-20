import { execFile } from "node:child_process";
import { config } from "../config.js";

/**
 * yt-dlp maintenance helpers (version check + self-update). Kept separate from
 * ytdlp.ts so they don't share its ANSI-parsing internals.
 */

/** Return the installed yt-dlp version, or null if it can't be resolved. */
export function ytdlpVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      config.ytdlpPath,
      ["--version"],
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => resolve(err ? null : stdout.toString().trim() || null),
    );
  });
}

/** Run `yt-dlp -U`. Returns success flag + combined output for display. */
export function ytdlpUpdate(): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(
      config.ytdlpPath,
      ["-U"],
      { windowsHide: true, timeout: 120000 },
      (err, stdout, stderr) => {
        const output = `${stdout ?? ""}${stderr ?? ""}`.toString().trim();
        resolve({ ok: !err, output });
      },
    );
  });
}
