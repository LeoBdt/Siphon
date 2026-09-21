/**
 * English is the source of truth for every UI string. Other locales declare
 * themselves as `typeof en`, so a missing or stray key is a type error rather
 * than a raw key leaking into the interface.
 *
 * Keys are grouped by surface. Values may be functions when they interpolate.
 */
export const en = {
  locale: {
    label: "Language",
    en: "English",
    fr: "Français",
    /** Shown on both options when the switcher has been poked too often. */
    dizzy: "Frenglish",
  },

  auth: {
    signInTitle: "Sign in",
    signInSubtitle: "This instance is private.",
    setupTitle: "Welcome to Siphon",
    setupSubtitle:
      "Create the administrator account. There is no default password — you choose it now.",
    inviteTitle: "Join this instance",
    inviteSubtitle: (group: string) => `You have been invited as ${group}.`,
    inviteInvalid: "This invitation has expired or has already been used.",
    username: "Username",
    code: "Authentication code",
    codeHint: "The six digits from your authenticator app.",
    password: "Password",
    passwordHint: (min: number) => `At least ${min} characters.`,
    submitSignIn: "Sign in",
    submitSetup: "Create account",
    submitInvite: "Create my account",
    signOut: "Sign out",
    showPassword: "Show password",
    hidePassword: "Hide password",
    checking: "Checking…",
    privacyRevokedTitle: "Your folder is no longer private",
    understood: "Understood",
    privacyRevoked:
      "Your folder is no longer private: an administrator withdrew the permission.",
  },

  nav: {
    download: "Download",
    files: "Files",
    history: "History",
    settings: "Settings",
    home: "Siphon — home",
  },

  common: {
    cancel: "Cancel",
    retry: "Retry",
    delete: "Delete",
    close: "Close",
    save: "Save",
    loading: "Loading…",
    empty: "Nothing here yet",
    unknown: "Unknown",
    error: "Something went wrong",
  },

  download: {
    title: "Download a video",
    subtitle: "Paste a URL — video, playlist or channel — and pick a quality.",
    cardTitle: "New job",
    cardDescription: "The download lands in the folder you select below.",
    urlPlaceholder: "https://www.youtube.com/watch?v=…",
    analyzing: "Reading the URL…",
    probeFailed: "Could not read this URL. Check the link.",
    playlistBadge: (n: number) => `Playlist · ${n} video${n > 1 ? "s" : ""}`,
    quality: "Quality",
    destination: "Destination",
    root: "Root",
    submit: "Download",
    retention: "Where it goes",
    retentionLibrary: "Library",
    retentionDirect: "Direct",
    retentionLibraryHint: "Kept on the server, browsable in Files.",
    retentionDirectHint:
      "Sent to your browser, then removed from the server. Collect it within a day.",
    save: "Save file",
    submitMany: (n: number) => `Download (${n})`,
    started: "Download started",
    startedMany: (n: number) => `${n} downloads started`,
    active: (n: number) => `In progress (${n})`,
    done: "Done",
  },

  quality: {
    modeVideo: "Video",
    modeAudio: "Audio only",
    videoNote: "Sound included, always at the best available quality",
    advanced: "Advanced options",
    maxResolution: "Max resolution",
    fps: "Frames per second",
    auto: "Auto",
    autoMax: "Auto (max)",

    presets: {
      best: {
        label: "Best quality",
        description: "Video and audio, the best available",
      },
      "2160p": { label: "4K · 2160p", description: "Ultra HD (3840×2160) max" },
      "1440p": { label: "1440p", description: "Quad HD (2560×1440) max" },
      "1080p60": {
        label: "1080p · 60 fps",
        description: "Full HD, smooth at 60 frames per second",
      },
      "1080p": { label: "1080p", description: "Full HD (1920×1080) max" },
      "720p": { label: "720p", description: "HD (1280×720) max" },
      "480p": { label: "480p", description: "SD (854×480) max" },
      "audio-mp3": {
        label: "MP3",
        description: "Re-encoded to MP3 — plays anywhere, slight quality loss",
      },
      "audio-m4a": {
        label: "M4A (original)",
        description:
          "The original AAC track, extracted as-is — no re-encoding, no loss",
      },
      "audio-opus": {
        label: "Opus (original)",
        description:
          "The original Opus track — best quality for the size, less compatible",
      },
    },
  },

  job: {
    queued: "Queued",
    analyzing: "Reading",
    downloadingVideo: "Downloading · video",
    downloadingAudio: "Downloading · audio",
    merging: "Merging video and audio",
    converting: "Converting",
    completed: "Done",
    failed: "Failed",
    canceled: "Canceled",
    videos: (n: number) => `${n} video${n > 1 ? "s" : ""}`,
    steps: {
      download: "Download",
      process: "Process",
      done: "Done",
    },
    actions: {
      cancel: "Cancel",
      retry: "Try again",
      remove: "Remove from history",
    },
    eta: "ETA",
  },

  player: {
    volume: "Volume",
    volumeAt: (pct: number) => `Volume ${pct}%`,
    mute: "Mute",
    unmute: "Unmute",
    fullscreen: "Fullscreen",
    video: "Video",
  },

  playlist: {
    selected: (n: number, total: number) => `${n} of ${total} selected`,
    selectAll: "Select all",
    clearAll: "Clear all",
  },

  // Lyrics stay in English in every locale — translating them kills the joke.
  rick: {
    button: "Never gonna let you down",
    badge: "A classic",
    toast: "Never gonna give you up",
  },

  toast: {
    jobDone: (title: string) => `Done: ${title}`,
    jobFailed: (title: string) => `Failed: ${title}`,
  },

  settings: {
    title: "Settings",
    subtitle: "Downloads, storage and yt-dlp maintenance.",

    sections: {
      general: "General",
      downloads: "Downloads",
      storage: "Storage",
      engine: "Engine",
      accounts: "Accounts",
    },

    concurrency: {
      title: "Simultaneous downloads",
      description:
        "How many videos download at once. Too many can saturate your bandwidth or get you rate-limited.",
      saved: (n: number) =>
        n > 1 ? `${n} downloads in parallel` : "One download at a time",
    },

    disk: {
      title: "Disk space",
      description: "The volume backing your library.",
      reading: "Reading…",
      unavailable: "Disk space unavailable.",
      used: (used: string, pct: number) => `${used} used · ${pct}%`,
      free: (free: string, total: string) => `${free} free of ${total}`,
    },

    cleanup: {
      title: "Temporary files",
      description:
        "An interrupted download leaves leftovers behind: .part fragments and video/audio tracks that were never merged, which can add up to several gigabytes. Cleanup is refused while a download is running.",
      action: "Clean up now",
      nothing: "Nothing to clean up",
      done: (n: number, freed: string) =>
        `${n} file${n > 1 ? "s" : ""} deleted · ${freed} freed`,
    },

    update: {
      title: "Siphon updates",
      description:
        "Asks GitHub whether a newer release exists. Nothing is sent, and nothing leaves the machine until you press the button.",
      installed: "Installed version",
      check: "Check for updates",
      upToDate: "You are running the latest release.",
      available: (v: string) => `Version ${v} is available`,
      howTo: "Pull the new images and recreate the containers on your host:",
      releaseNotes: "What changed",
      noReleases: "No release has been published yet.",
      rateLimited: "GitHub is rate-limiting this address. Try again later.",
      unreachable: "Could not reach GitHub.",
    },

    ytdlp: {
      title: "yt-dlp",
      description:
        "The download engine. Update it regularly — YouTube changes often and breaks older versions.",
      installed: "Installed version",
      action: "Check for updates",
      checked: "yt-dlp checked",
      failed: "yt-dlp update failed",
      stale: "yt-dlp has not been checked in a while. An outdated engine is the usual reason downloads start failing.",
      lastCheckLabel: "Last check",
      lastChecked: (when: string) => when,
      neverChecked: "Never checked",
      auto: "Check automatically",
      autoHint: "On start, then once a day. Updates apply immediately.",
      on: "On",
      off: "Off",
    },

    accounts: {
      title: "Accounts",
      members: "Members",
      membersHint: "People with access to this instance.",
      groups: "Groups",
      groupsHint:
        "A group sets the defaults. Anything set on a member overrides them.",
      invite: "Invite someone",
      inviteHint:
        "The link carries the address you are using right now — open Siphon on the address you want to share before creating one.",
      inviteCopied: "Invitation link copied",
      inviteExpires: (when: string) => `Expires ${when}`,
      revoke: "Revoke",
      you: "you",
      lastSeen: (when: string) => `Last seen ${when}`,
      neverSignedIn: "Never signed in",
      usage: "Usage",
      viewHistory: "View history",
      copyLink: "Copy link",
      permissionsAndUsage: "Permissions and usage",
      copyFailed: "Could not copy — select the link and copy it by hand.",

      diskUsed: "On disk",
      wholeLibrary: "Whole library",
      fileCount: "Files",
      downloadCount: "Downloads",
      fetched: "Fetched",
      completedCount: "Completed",
      failedCount: "Failed",
      lastDownload: "Last download",
      never: "Never",
      newGroup: "New group",
      groupName: "Group name",
      inherited: "From group",
      deleteMember: "Remove this member",
      suspend: "Suspend",
      lockedBySystem: (when: string) =>
        `Locked by the system until ${when} — too many failed sign-ins`,
      unlock: "Unlock",
      unsuspend: "Restore access",
      suspended: "Suspended",
      deleteTitle: (name: string) => `Delete ${name}?`,
      deleteWarning:
        "This removes the account and everything in its folder. Downloads already in the shared library are untouched. This cannot be undone.",
      deleteConfirm: (name: string) => `Type ${name} to confirm`,
      deleteAction: "Delete permanently",
      deleted: "Account deleted",
      permissions: {
        canDownload: "Download",
        canKeepInLibrary: "Keep files in the library",
        canManageFiles: "Rename, move and delete files",
        canManageSettings: "Change application settings",
        canHavePrivateFolder: "May keep a private folder",
        canBrowseWholeLibrary: "See the whole library",
        isAdmin: "Administrator",
      },
    },

    privacy: {
      title: "Private folder",
      description:
        "Hides your folder from other members in this interface. It is discretion, not secrecy: whoever runs the server still reaches the files on disk.",
      unavailable: "An administrator has not granted this permission.",
    },

    security: {
      title: "Second factor",
      description:
        "Ask for a six-digit code from an authenticator app when signing in.",
      enabled: "Enabled",
      start: "Set up",
      secretHint:
        "Add this secret to your authenticator app, then enter the code it shows to confirm it works.",
      confirm: "Confirm",
      disable: "Turn off",
      disableHint: "Enter your password to turn it off.",
      turnedOn: "Second factor enabled",
      turnedOff: "Second factor turned off",
    },

    audit: {
      title: "Activity",
      description: "Sign-ins and changes made to this instance.",
      empty: "Nothing recorded yet.",
      actions: {
        "login.success": "Signed in",
        "login.failed": "Failed sign-in",
        "login.locked": "Account locked",
        logout: "Signed out",
        "user.created": "Member added",
        "user.updated": "Member changed",
        "user.deleted": "Member removed",
        "group.created": "Group created",
        "group.updated": "Group changed",
        "group.deleted": "Group deleted",
        "invite.created": "Invitation created",
        "invite.revoked": "Invitation revoked",
        "privacy.revoked": "Private folder revoked",
        "totp.enabled": "Second factor enabled",
        "totp.disabled": "Second factor turned off",
        "password.changed": "Password changed",
      },
    },

    language: {
      title: "Language",
      description: "Applies to the whole interface.",
    },

    theme: {
      title: "Appearance",
      description: "System follows your operating system's setting.",
      light: "Light",
      dark: "Dark",
      system: "System",
    },
  },

  history: {
    title: "History",
    subtitle: "Every download, with retry and delete.",
    search: "Search…",
    empty: "No downloads yet",
    noResults: "No results.",
    filters: {
      all: "All",
      downloading: "In progress",
      completed: "Completed",
      error: "Failed",
      canceled: "Canceled",
    },
    scope: {
      all: "Everyone",
      mine: "Mine",
      label: "Whose downloads",
      only: (name: string) => `${name} only`,
    },
    by: (name: string) => `by ${name}`,
  },

  files: {
    title: "Files",
    empty: "This folder is empty",
    newFolder: "New folder",
    folderName: "Folder name",
    create: "Create",
    rename: "Rename",
    download: "Download",
    downloadZip: "Download folder (zip)",
    // Explicit `string` return: without it TS infers a union of the two English
    // literals and no translation can satisfy the type.
    downloadEntry: (isDir: boolean): string =>
      isDir ? "Download (zip)" : "Download",
    play: "Play",
    open: "Open",
    refresh: "Refresh",
    emptyHint:
      "Empty folder — right-click to create one, or drag files in here.",
    root: "Root",
    moved: (target: string) => `Moved to ${target}`,
    movedMany: (n: number, target: string) =>
      `${n} item${n > 1 ? "s" : ""} moved to ${target}`,
    renamed: "Renamed",
    renameTitle: "Rename",
    deleted: "Deleted",
    deletedMany: (n: number) => `${n} item${n > 1 ? "s" : ""} deleted`,
    folderCreated: "Folder created",

    // Live hint while renaming a folder to something like "Holidays.mp4".
    disguiseHint: (ext: string) =>
      `A folder in a ${ext} costume. It will still open like a folder.`,
    disguiseTooltip: "A folder in a costume",
    privateFolder: "Private folder — kept out of other members' way",

    selected: (n: number) => `${n} selected`,
    selectAll: "Select all",
    clearSelection: "Clear selection",
    downloadSelected: "Download selection",
    deleteSelected: "Delete selection",
    downloadingHere: "Downloading",
  },

  // Errors the API returns about the request itself, keyed by its `code`.
  apiErrors: {
    accountLockedUntil: (when: string) =>
      `Too many failed attempts. This account is locked until ${when}.`,
    account_suspended: "This account has been suspended by an administrator.",
    csrf_failed: "That request could not be verified. Reload and try again.",
    account_locked:
      "Too many failed attempts. This account is locked for a few minutes.",
    totp_required: "Enter the code from your authenticator app.",
    totp_invalid: "That authentication code is not right.",
    unauthenticated: "Please sign in.",
    forbidden: "You do not have permission to do that.",
    invalid_credentials: "Wrong username or password.",
    weak_password: "That password is too short.",
    too_many_attempts: "Too many attempts. Try again in a few minutes.",
    already_setup: "This instance is already configured.",
    last_admin: "This is the only administrator.",
    self_delete: "You cannot delete your own account.",
    group_in_use: "Built-in groups, and groups with members, cannot be deleted.",
    invalid_name: "A name is required.",
    downloads_active: "Downloads are running — try again once they finish.",
    concurrency_out_of_range: "That value is out of the allowed range.",
    already_exists: "A file or folder with that name already exists.",
    invalid_path: "That location is not allowed.",
    not_found: "Not found.",
  },

  errors: {
    private_video: "This video is private.",
    members_only: "This video is reserved for channel members.",
    unavailable: "This video was removed or is unavailable.",
    age_restricted: "This video is age-restricted and needs sign-in.",
    geo_blocked: "This video is not available in your country.",
    bot_check: "YouTube asked for a human check. Try again later.",
    no_format: "No format matches the requested quality.",
    network: "Network error while reaching the platform.",
    ffmpeg_missing: "ffmpeg was not found — it is required to merge streams.",
    unknown: "Download failed.",
  },
};
// No `as const` on purpose: literal types would force other locales to repeat
// the English strings verbatim instead of translating them.

export type Dictionary = typeof en;
