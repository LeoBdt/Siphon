import "dotenv/config";
import { dirname, join, resolve } from "node:path";

/**
 * Centralised, validated configuration read from the environment.
 * ROOT_DIR is resolved to an absolute path once here so the rest of the
 * app can rely on it for sandbox checks.
 */
const rootDir = resolve(process.env.ROOT_DIR ?? "./data/library");

export const config = {
  port: Number(process.env.PORT ?? 3001),
  rootDir,
  /**
   * Scratch space for yt-dlp: partial downloads, fragments and the thumbnail it
   * fetches before embedding all land here, and only the finished file is moved
   * into the library. Kept *outside* ROOT_DIR so none of it is ever listed, and
   * on the same volume so the final move stays a rename rather than a copy.
   */
  tmpDir: resolve(process.env.TMP_DIR ?? join(dirname(rootDir), "tmp")),
  dbPath: resolve(process.env.DB_PATH ?? "./data/app.db"),
  ytdlpPath: process.env.YTDLP_PATH ?? "yt-dlp",
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  maxConcurrentDownloads: Number(process.env.MAX_CONCURRENT_DOWNLOADS ?? 2),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
} as const;
