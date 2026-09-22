import { join } from "node:path";
import type { User, UserStats } from "@app/shared";
import { config } from "../config.js";
import {
  dailyDownloadsFor,
  downloadStatsFor,
  presetBreakdownFor,
} from "../db.js";
import { dirUsage } from "./dir-size.js";
import { concurrencyCeiling, getMaxConcurrent } from "../downloads-manager.js";

/**
 * What one account has done and what it is allowed.
 *
 * Built in one place because two routes ask for it: an administrator looking
 * at somebody's account, and anybody looking at their own. Those answers must
 * agree — a member reading different figures from the ones their administrator
 * sees is a support conversation waiting to happen.
 */

/** How far back the chart looks. */
export const STATS_DAYS = 30;

/** Every day of the window, in order, with the quiet ones filled in. */
function fillDays(
  rows: { date: string; count: number; bytes: number }[],
  days: number,
): { date: string; count: number; bytes: number }[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: { date: string; count: number; bytes: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? { date, count: 0, bytes: 0 });
  }
  return out;
}

export async function statsFor(user: User): Promise<UserStats> {
  // Someone who browses the whole library has no folder of their own, so what
  // they occupy *is* the library. Measured rather than skipped: reporting
  // "the whole library" in place of a figure answered a different question
  // from the one asked, and an administrator wanting to know how full the
  // disk is had nowhere to look.
  const scoped = !user.effective.canBrowseWholeLibrary;
  const usage = await dirUsage(
    scoped ? join(config.rootDir, "users", user.libraryDir) : config.rootDir,
  );

  // The instance's own concurrency is a ceiling over anyone's: granting an
  // account more than the queue will ever run at once promises nothing.
  const instance = Math.min(getMaxConcurrent(), concurrencyCeiling());
  const own = user.effective.maxConcurrentDownloads;
  const effectiveConcurrency = own == null ? instance : Math.min(own, instance);

  return {
    userId: user.id,
    scoped,
    diskBytes: usage.bytes,
    fileCount: usage.files,
    folderCount: usage.folders,
    quotaBytes: user.effective.quotaBytes,
    maxFileSizeBytes: user.effective.maxFileSizeBytes,
    maxConcurrentDownloads: effectiveConcurrency,
    concurrencyCappedByInstance: own != null && own > instance,
    daily: fillDays(dailyDownloadsFor(user.id, STATS_DAYS), STATS_DAYS),
    byPreset: presetBreakdownFor(user.id) as UserStats["byPreset"],
    ...downloadStatsFor(user.id),
  };
}
