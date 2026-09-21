/**
 * Shared types between the web front-end and the API back-end.
 * Keep this framework-agnostic: no Node or DOM specifics here.
 */

// ---------------------------------------------------------------------------
// Download / quality presets
// ---------------------------------------------------------------------------

/**
 * Quality preset identifiers.
 *
 * `1080p60` is no longer offered: presets describe resolution, and singling out
 * one resolution for frame rate was arbitrary — why 60 fps at 1080p but not in
 * 4K? Frame rate is capped from the advanced panel instead, and left alone by
 * default so yt-dlp takes the smoothest stream available. The id is kept so
 * history rows recorded with it still replay exactly as they did.
 */
export type QualityPresetId =
  | "best"
  | "2160p"
  | "1440p"
  /** @deprecated Legacy: recorded by older versions, no longer offered. */
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
  /** Where the finished file goes. */
  retention: RetentionMode;
  /** Who started it. Null for jobs recorded before accounts existed. */
  userId: string | null;
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
  /** Defaults to "library"; "direct" needs the canKeepInLibrary permission off
   *  or on — either way the file is removed once fetched. */
  retention?: RetentionMode;
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
  /**
   * A member's folder they have marked private.
   *
   * Only ever set on entries of the shared `users` directory, and only sent to
   * an administrator: other members do not see the folder at all. Marking it
   * rather than hiding it from the administrator too is deliberate — whoever
   * runs the server reads the disk, and a padlock says what is true instead of
   * pretending otherwise.
   */
  isPrivate?: boolean;
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
  | "unauthenticated"
  | "account_locked"
  | "totp_required"
  | "totp_invalid"
  | "csrf_failed"
  | "account_suspended"
  | "forbidden"
  | "invalid_credentials"
  | "weak_password"
  | "too_many_attempts"
  | "already_setup"
  | "last_admin"
  | "self_delete"
  | "group_in_use"
  | "invalid_name"
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

/**
 * Whether a newer Siphon has been released.
 *
 * Only ever produced by an explicit request: checking contacts GitHub, and an
 * app that promises to keep to itself should not reach out on a timer without
 * being asked. Nothing is sent but the request itself.
 */
export interface ReleaseCheck {
  /** The version this instance is running. */
  current: string;
  /** Latest published release tag, or null when none exists yet. */
  latest: string | null;
  /** True only when `latest` is strictly newer than `current`. */
  updateAvailable: boolean;
  /** Where to read what changed. */
  url: string | null;
  publishedAt: string | null;
  /**
   * The check could not be made — no network, GitHub rate-limiting, no
   * releases yet. Reported rather than thrown so the card can say what
   * happened instead of showing a generic failure.
   */
  error: "unreachable" | "rate_limited" | "no_releases" | null;
}

/** Result of triggering a yt-dlp self-update. */
export interface YtdlpUpdateResult {
  ok: boolean;
  version: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// Accounts, groups and permissions
// ---------------------------------------------------------------------------

/**
 * What a member is allowed to do.
 *
 * Every field is resolved from the user's group, then overridden per user where
 * that user carries an explicit value. Keeping the two layers apart is what
 * makes editing a group take effect for everyone who has not been singled out.
 */
export interface Permissions {
  /** Start downloads at all. */
  canDownload: boolean;
  /** Keep finished files in the library, rather than only fetching them once. */
  canKeepInLibrary: boolean;
  /** Rename, move and delete inside the library. */
  canManageFiles: boolean;
  /** Read and change application settings (concurrency, cleanup, yt-dlp). */
  canManageSettings: boolean;
  /** Administer members and groups. Implies every other permission. */
  isAdmin: boolean;
  /**
   * Hide their personal folder from everyone else in the interface.
   *
   * Discretion, not secrecy: whoever runs the server still reaches the files
   * through the disk, the volume or the database. The interface says so.
   */
  canHavePrivateFolder: boolean;
  /**
   * See the whole library instead of a private folder of their own. Granted to
   * the first account so an existing library stays visible after upgrading.
   */
  canBrowseWholeLibrary: boolean;
  /** Downloads this member may run at once. Null means the global setting. */
  maxConcurrentDownloads: number | null;
  /** Bytes this member's files may occupy. Null means no quota. */
  quotaBytes: number | null;
}

/** A per-user override: null on a field means "inherit from the group". */
export type PermissionOverrides = {
  [K in keyof Permissions]: Permissions[K] | null;
};

export interface Group {
  id: string;
  name: string;
  /** Built-in groups cannot be deleted, and Administrators cannot be demoted. */
  builtIn: boolean;
  permissions: Permissions;
  memberCount: number;
}

export interface User {
  id: string;
  username: string;
  groupId: string;
  groupName: string;
  /** Only the fields this user overrides; the rest come from the group. */
  overrides: PermissionOverrides;
  /** Group defaults with the overrides applied — what actually applies. */
  effective: Permissions;
  /** Whether this member has actually turned privacy on. */
  privateFolder: boolean;
  /** Whether a second factor is required to sign in. */
  totpEnabled: boolean;
  /**
   * Shut out by an administrator, as opposed to locked by failed attempts.
   * Indefinite, and lifted only by an administrator.
   */
  suspended: boolean;
  /**
   * Locked by the system after repeated failed sign-ins, until this moment.
   * Null when open. Deliberately separate from `suspended`: one is a counter
   * running out, the other is a decision somebody made.
   */
  lockedUntil: string | null;
  /** Folder holding this member's files, relative to the library root. */
  libraryDir: string;
  createdAt: string;
  lastSeenAt: string | null;
}

/**
 * Something the member needs to be told once, on their next visit.
 *
 * `privacy_revoked` matters: a folder they believed private stopped being so
 * because an administrator withdrew the permission, and finding that out by
 * accident would be worse than a notice.
 */
export type UserNotice = "privacy_revoked";

/** Whether the instance still needs its first account, and who is signed in. */
export interface AuthState {
  needsSetup: boolean;
  user: User | null;
  notice: UserNotice | null;
}

/**
 * An unused invitation.
 *
 * Members are added by invitation rather than created outright: the person
 * chooses their own username and password, and an administrator never handles
 * someone else's credentials.
 */
export interface Invite {
  token: string;
  groupId: string;
  groupName: string;
  createdAt: string;
  expiresAt: string;
}

/** What an invitee sees before accepting, without revealing anything else. */
export interface InvitePreview {
  valid: boolean;
  groupName: string | null;
}

export interface Credentials {
  username: string;
  password: string;
}

/**
 * A recorded action, for the audit trail.
 *
 * Kept as codes rather than sentences so the log reads in the viewer's
 * language, and so entries stay searchable when the wording changes.
 */
export type AuditAction =
  | "login.success"
  | "login.failed"
  | "login.locked"
  | "logout"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "group.created"
  | "group.updated"
  | "group.deleted"
  | "invite.created"
  | "invite.revoked"
  | "privacy.revoked"
  | "totp.enabled"
  | "totp.disabled"
  | "password.changed";

export interface AuditEntry {
  id: number;
  at: string;
  action: AuditAction;
  /** Who did it. Null for a failed sign-in with an unknown username. */
  actorName: string | null;
  /** What it was done to: a username, a group name, an invitation. */
  target: string | null;
  ip: string | null;
}

/**
 * What one member is using, for the administrator's view of an account.
 *
 * Disk figures are walked from their folder; the download counts come from the
 * job history. The two disagree on purpose — a deleted file still counts as
 * fetched — and the interface labels them separately rather than reconciling
 * them into one misleading number.
 */
export interface UserStats {
  userId: string;
  /**
   * False for anyone who browses the whole library, whose usage is the
   * instance's own. The interface then shows the shared disk gauge instead of
   * repeating it per account.
   */
  scoped: boolean;
  diskBytes: number;
  fileCount: number;
  folderCount: number;
  /** Jobs started, counting playlist entries individually. */
  total: number;
  completed: number;
  /** Errored or canceled. */
  failed: number;
  /** Sum of the completed jobs' file sizes, including files since deleted. */
  bytesFetched: number;
  lastDownloadAt: string | null;
}

/** Why a sign-in was refused, when the reason is worth telling the user. */
export interface LockedOut {
  lockedUntil: string;
}

/**
 * Where a finished download ends up.
 *
 * `library` keeps it on the server, browsable in Files. `direct` writes it to
 * scratch space, hands it to the browser, and deletes it — for the times you
 * want the file, not a copy on someone else's disk.
 */
export type RetentionMode = "library" | "direct";

/**
 * Minimum password length, enforced by the API and announced by the form.
 *
 * Length is the only requirement: composition rules push people towards
 * predictable substitutions and a sticky note, and on a self-hosted instance
 * the person choosing the password is the person carrying the risk.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const GROUP_ADMIN_ID = "admin";
export const GROUP_MEMBER_ID = "member";
