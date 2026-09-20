/**
 * Shared types between the web front-end and the API back-end.
 * Keep this framework-agnostic: no Node or DOM specifics here.
 */

// ---------------------------------------------------------------------------
// Download / quality presets
// ---------------------------------------------------------------------------

/** Identifiers for the quality presets exposed in the UI. */
export type QualityPresetId =
  | "best"
  | "2160p"
  | "1440p"
  | "1080p60"
  | "1080p"
  | "720p"
  | "480p"
  | "audio-mp3"
  | "audio-m4a"
  | "audio-opus";

/**
 * Presets carry only what the engine needs. Their labels and descriptions live
 * in the web app's locale dictionaries, keyed by `id`, so they follow the
 * interface language instead of being frozen in shared code.
 */
export interface QualityPreset {
  id: QualityPresetId;
  /** "video" merges audio+video, "audio" extracts audio only. */
  kind: "video" | "audio";
  maxHeight?: number | null;
  maxFps?: number | null;
}

export const QUALITY_PRESETS: QualityPreset[] = [
  { id: "best", kind: "video", maxHeight: null, maxFps: null },
  { id: "2160p", kind: "video", maxHeight: 2160, maxFps: null },
  { id: "1440p", kind: "video", maxHeight: 1440, maxFps: null },
  { id: "1080p60", kind: "video", maxHeight: 1080, maxFps: 60 },
  { id: "1080p", kind: "video", maxHeight: 1080, maxFps: null },
  { id: "720p", kind: "video", maxHeight: 720, maxFps: null },
  { id: "480p", kind: "video", maxHeight: 480, maxFps: null },
  { id: "audio-mp3", kind: "audio" },
  { id: "audio-m4a", kind: "audio" },
  { id: "audio-opus", kind: "audio" },
];

/** Fine-grained override for the "advanced" quality panel. */
export interface AdvancedFormat {
  /** Cap the video height (e.g. 1080). null = no cap. */
  maxHeight: number | null;
  /** Cap the frame rate (e.g. 60). null = no cap. */
  maxFps: number | null;
}

// ---------------------------------------------------------------------------
// Downloads / jobs
// ---------------------------------------------------------------------------

export type DownloadStatus =
  | "queued"
  | "fetching-info"
  | "downloading"
  | "processing"
  | "completed"
  | "error"
  | "canceled";

export interface DownloadJob {
  id: string;
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  preset: QualityPresetId;
  /** Destination folder, relative to the sandbox ROOT_DIR. */
  destPath: string;
  status: DownloadStatus;
  /** 0..1 */
  progress: number;
  outputFile: string | null;
  fileSizeBytes: number | null;
  /** Stable reason for a failure; the client renders it in the active locale. */
  errorCode: DownloadErrorCode | null;
  /** Raw yt-dlp line behind the failure, for diagnostics. */
  errorMessage: string | null;
  /** Live download speed in bytes/sec while running. */
  speedBytesPerSec: number | null;
  /** Estimated seconds remaining while running. */
  etaSeconds: number | null;
  /** Set on child jobs that belong to a playlist/channel batch. */
  playlistId: string | null;
  /** True for the parent aggregate job of a playlist/channel. */
  isPlaylistParent: boolean;
  /** For a parent: number of child jobs. */
  childCount: number | null;
  /** Fine-grained phase during downloading/processing (drives the stepper). */
  phase: DownloadPhase | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Stable classification of a failed download. The API never sends prose for
 * these — the client owns the wording, so it follows the interface language.
 */
export type DownloadErrorCode =
  | "private_video"
  | "members_only"
  | "unavailable"
  | "age_restricted"
  | "geo_blocked"
  | "bot_check"
  | "no_format"
  | "network"
  | "ffmpeg_missing"
  | "unknown";

/** Sub-phase surfaced while a job runs, for the progress stepper. */
export type DownloadPhase =
  | "downloading-video"
  | "downloading-audio"
  | "merging"
  | "converting";

/** Payload accepted by POST /api/downloads. */
export interface CreateDownloadRequest {
  url: string;
  preset: QualityPresetId;
  destPath: string;
  /** When set, overrides the preset's resolution/fps caps. */
  advanced?: AdvancedFormat | null;
  /** For playlists: only download these entry URLs (empty/absent = all). */
  playlistItems?: string[] | null;
}

/** A single entry of a playlist/channel, for the selection UI. */
export interface VideoInfoEntry {
  url: string;
  title: string;
  id: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}

/** Metadata returned when probing a URL before download. */
export interface VideoInfo {
  url: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  uploader: string | null;
  isPlaylist: boolean;
  entryCount: number | null;
  /** Present for playlists/channels so the UI can let the user pick titles. */
  entries?: VideoInfoEntry[];
}

// ---------------------------------------------------------------------------
// Real-time progress (WebSocket)
// ---------------------------------------------------------------------------

export type WsServerMessage =
  | { type: "job:update"; job: DownloadJob }
  | { type: "job:log"; jobId: string; line: string };

// ---------------------------------------------------------------------------
// File manager
// ---------------------------------------------------------------------------

export interface FileNode {
  name: string;
  /** Path relative to ROOT_DIR, using forward slashes. "" is the root. */
  path: string;
  type: "file" | "directory";
  sizeBytes: number | null;
  modifiedAt: string;
  /** For media files we can surface a thumbnail later. */
  mimeType: string | null;
}

export interface ListDirResponse {
  path: string;
  entries: FileNode[];
}

// ---------------------------------------------------------------------------
// Settings & system
// ---------------------------------------------------------------------------

/** Accepted range for `maxConcurrentDownloads`, shared by the UI and the API. */
export const CONCURRENCY_MIN = 1;
export const CONCURRENCY_MAX = 8;

/** User-tunable settings persisted server-side. */
export interface AppSettings {
  /** How many downloads run concurrently (CONCURRENCY_MIN..CONCURRENCY_MAX). */
  maxConcurrentDownloads: number;
  /**
   * Check for a newer yt-dlp on boot and once a day. On by default: the
   * overwhelming majority of download failures come from a yt-dlp that is too
   * old, not from one that is too new.
   */
  autoUpdateYtdlp: boolean;
}

/**
 * Stable codes for the errors the API returns to the UI. Responses also carry
 * a plain-English `error` string as a fallback for non-UI clients.
 */
export type ApiErrorCode =
  | "downloads_active"
  | "concurrency_out_of_range"
  | "already_exists"
  | "invalid_path"
  | "not_found";

export interface ApiErrorBody {
  code: ApiErrorCode;
  error: string;
}

/** Result of sweeping leftover yt-dlp temp files from the library. */
export interface CleanupResult {
  removed: number;
  bytesFreed: number;
}

/** Free/used space of the volume backing ROOT_DIR. */
export interface DiskUsage {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
}

/** yt-dlp version info and the outcome of the last update check. */
export interface YtdlpInfo {
  version: string | null;
  /** ISO date of the last check, automatic or manual. Null if never checked. */
  lastCheckedAt: string | null;
}

/** Result of triggering a yt-dlp self-update. */
export interface YtdlpUpdateResult {
  ok: boolean;
  version: string | null;
  message: string;
}
