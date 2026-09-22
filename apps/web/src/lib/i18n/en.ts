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
    // "Welcome back", not "Welcome": the first-run screen owns that word, and
    // the difference between creating an instance and returning to one is
    // worth keeping. The subtitle says what to do rather than who is kept out
    // — whoever is reading it has an account.
    signInTitle: "Welcome back",
    signInSubtitle: "Sign in to reach your library.",
    setupTitle: "Welcome to Siphon",
    setupSubtitle:
      "Create the administrator account. There is no default password — you choose it now.",
    inviteTitle: "Join this instance",
    // No group name here. "You have been invited as Members" quotes an
    // administrator's label at someone who has never seen it, and it reads
    // worse the more descriptive the group is ("invited as Restricted
    // accounts"). The subtitle says what to do instead; the greeting above
    // already says who invited them.
    inviteSubtitle: "Pick a username and a password to create your account.",
    inviteInvalid: "This invitation has expired or has already been used.",
    // Two greetings, because an invitation may be addressed to someone or to
    // whoever holds the link, and may or may not know who sent it. A username
    // is never used here: "admin invites you" reads like a machine wrote it.
    invitedByNamed: (who: string, by: string) => `${who}, ${by} invites you to Siphon`,
    invitedBy: (by: string) => `${by} invites you to Siphon`,
    invitedNamed: (who: string) => `${who}, you are invited to Siphon`,
    username: "Username",
    newPassword: "New password",
    resetTitle: "Choose a new password",
    resetSubtitle: "This link lets you set a new password.",
    resetSubtitleFor: (who: string) =>
      `This link sets a new password for ${who}.`,
    resetInvalid: "This link has expired or has already been used.",
    resetOtherSession: (current: string, target: string) =>
      `You are signed in as ${current}. This link sets ${target}'s password — continuing will sign you out of ${current}.`,
    submitReset: "Set my password",
    displayName: "Your name",
    displayNamePlaceholder: "e.g. Alex",
    displayNameHint:
      "Shown to the others beside your downloads. Optional, and changeable later.",
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
    /** Shown to someone who may not keep files, in place of the choice. */
    cannotKeepHint:
      "Your account cannot keep files in the library. This download will be handed to your browser once it is ready, then removed from the server.",
    save: "Save file",
    tooLarge: {
      // The estimate is a guess most of the time, so the wording says so and
      // the choice is left to the person — the server stops it for real if it
      // turns out to exceed.
      warn: (size: string, limit: string) =>
        `This looks like about ${size}, over your ${limit} limit. It will be stopped if it really is.`,
      refused: (size: string, limit: string) =>
        `This is ${size}, over your ${limit} limit.`,
      quota: (limit: string) => `This would go over your ${limit} quota.`,
      anyway: "Download anyway",
    },
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
    /** Playlist progress: how many entries are through, out of how many. */
    entriesDone: (done: number, total: number) => `${done}/${total}`,
    failedEntries: (n: number) => `${n} failed`,
    /** A playlist that reached the end with entries missing. */
    partial: (n: number) => `${n} missing`,
    showFailed: "Failures",
    hideFailed: "Failures",
    noFailureDetail: "No detail recorded for this entry.",
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

    // Grouped by who they concern: yours, and the server's.
    groups: {
      mine: "My account",
      instance: "Instance",
      accounts: "Accounts",
    },
    sections: {
      profile: "Profile",
      groupsSection: "Groups",
      invites: "Invitations",
      activity: "Activity",
      security: "Security",
      appearance: "Appearance",
      downloads: "Downloads",
      storage: "Storage",
      engine: "Engine",
      users: "Users",
    },

    profile: {
      title: "Profile",
      description:
        "Your name is what other people see beside your downloads and on the invitations you send. Your username stays what you sign in with.",
      displayName: "Display name",
      displayNamePlaceholder: "e.g. Alex",
      displayNameHint:
        "Optional. Without one, you appear under your username.",
      username: "Username",
      usernameHint: "Chosen when the account was created. Only an administrator can change it.",
      save: "Save",
      saved: "Profile updated",
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
        // Deliberately short: the previous wording spent three clauses
        // promising that nothing left the machine, which only made people
        // wonder what might.
        "Checks GitHub for a newer release.",
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
      /** The verdict, decided server-side by comparing versions. */
      alreadyCurrent: (v: string) => `Already up to date — ${v}`,
      updatedTo: (from: string, to: string) => `Updated — ${from} → ${to}`,
      rawOutput: "yt-dlp output",
      stale: "yt-dlp has not been checked in a while. An outdated engine is the usual reason downloads start failing.",
      lastCheckLabel: "Last check",
      lastChecked: (when: string) => when,
      neverChecked: "Never checked",
      auto: "Check automatically",
      autoHint: "On start, then once a day. Updates apply immediately.",
      on: "On",
      off: "Off",
    },

    users: {
      title: "Users",
      tabs: {
        users: "Users",
        groups: "Groups",
        invites: "Invitations",
        audit: "Activity",
      },
      search: "Search by name, username or group",
      filterGroup: "All groups",
      filterStatus: "Any status",
      status: {
        active: "Active",
        suspended: "Suspended",
        locked: "Locked",
        admins: "Administrators",
      },
      count: (shown: number, total: number) =>
        shown === total
          ? `${total} user${total > 1 ? "s" : ""}`
          : `${shown} of ${total}`,
      empty: "No account yet. Invite someone to get started.",
      noResults: "No user matches that.",
      manage: "Manage",
      you: "you",
      noName: "No name set",
      lastSeen: (when: string) => `Last seen ${when}`,
      neverSignedIn: "Never signed in",
      suspended: "Suspended",
      lockedBySystem: (when: string) =>
        `Locked by the system until ${when} — too many failed sign-ins`,
      unlock: "Unlock",
      suspend: "Suspend",
      unsuspend: "Restore access",
      deleteMember: "Delete this account",
      deleteTitle: (name: string) => `Delete ${name}?`,
      deleteWarning:
        "This removes the account and everything in its folder. Downloads already in the shared library are untouched. This cannot be undone.",
      deleteConfirm: (name: string) => `Type ${name} to confirm`,
      deleteAction: "Delete permanently",
      deleted: "Account deleted",
      viewHistory: "View history",
      saved: "Saved",
      resetPassword: "Send a reset link",
      resetLinkCopied: "Reset link copied â send it to them",
      resetLinkAgain: "Issue a different link",
      resetLinkHint:
        "The user chooses the new password; you never see it. The link works once and expires in a day.",

      dialog: {
        identity: "Identity",
        identityHint:
          "The username is what they sign in with; changing it signs nobody out, but they need to be told.",
        permissions: "Permissions",
        usage: "Usage",
        group: "Group",
        groupHint:
          "The group sets the defaults. Anything decided below overrides them for this person only.",
        limits: "Limits",
        close: "Close",
      },

      // Three states, because a permission has three: taken from the group,
      // granted here, refused here. A checkbox could only ever express two,
      // and once ticked there was no way back to the group's value.
      tri: {
        inherit: "Inherited",
        allow: "Allowed",
        deny: "Refused",
        // The group is named once above the list, not on all eight rows: the
        // repetition was what made the labels long enough to squeeze the
        // permission names into two lines each.
        fromGroup: (group: string) => `Values not set here come from ${group}.`,
        inheritedValue: (value: string) => `Inherited (${value})`,
        yes: "allowed",
        no: "refused",
      },

      limits: {
        quotaBytes: "Storage quota",
        quotaBytesHint: "Total size this account's folder may reach.",
        maxFileSizeBytes: "Maximum file size",
        maxFileSizeBytesHint:
          "A download above this is stopped and removed. Sizes are estimated before starting, so the warning may come mid-download.",
        maxConcurrentDownloads: "Simultaneous downloads",
        maxConcurrentDownloadsHint:
          "Downloads this account may run at once, within the instance limit.",
        unlimited: "Unlimited",
        custom: "Limit",
        unitGb: "GB",
        unitCount: "at a time",
        adminUnlimited:
          "An administrator has no quota and no size limit.",
      },

      permissions: {
        canDownload: "Download",
        canKeepInLibrary: "Keep files in the library",
        canManageFiles: "Rename, move and delete files",
        canManageSettings: "See the instance settings",
        canManageEngine: "Manage the engine",
        canManageEngineHint:
          "Update yt-dlp, change concurrency, clean up temporary files.",
        canHavePrivateFolder: "May keep a private folder",
        canBrowseWholeLibrary: "See the whole library",
        isAdmin: "Administrator",
        isAdminHint:
          "Every permission above applies, whatever it is set to, and the account can manage the others.",
        // Shown on the rows an administrator holds by virtue of the role.
        adminGrants:
          "This account is an administrator: everything below applies to it.",
      },

      groups: {
        title: "Groups",
        hint: "A group sets the defaults for everyone in it.",
        members: (n: number) => `${n} user${n > 1 ? "s" : ""}`,
        newGroup: "New group",
        name: "Group name",
        builtInHint:
          "This group comes with Siphon and cannot be deleted. You can still change what it allows.",
        deleteGroupBlocked:
          "Move its members to another group before deleting it.",
        groupDeleted: "Group deleted",
        // Seeded into the database in English when the instance is created,
        // so the stored name can never follow the interface language. They
        // are translated from their fixed ids instead.
        builtIn: {
          admin: "Administrators",
          member: "Members",
        },
        edit: "Edit",
        deleteGroup: "Delete this group",
        adminLocked:
          "The Administrators group keeps its powers, so the instance always has someone able to manage it.",
      },

      invites: {
        title: "Invitations",
        hint: "The link carries the address you are using right now — open Siphon on the address you want to share before creating one.",
        forWhom: "Who is it for?",
        forWhomPlaceholder: "e.g. Alice",
        forWhomHint:
          "Shown to them when they open the link, and to you in the list below. Optional.",
        group: "Group",
        uses: "Uses",
        usesHint: "One link can create several accounts.",
        create: "Create invitation",
        copied: "Invitation link copied",
        copyLink: "Copy link",
        copyFailed: "Could not copy — select the link and copy it by hand.",
        expires: (when: string) => `Expires ${when}`,
        usedCount: (used: number, max: number) => `${used} of ${max} used`,
        unnamed: "No name",
        revoke: "Revoke",
        revokeTitle: "Revoke this invitation?",
        revokeWarning:
          "The link stops working immediately. Anyone who has it can no longer create an account. Accounts already created are untouched.",
        revoked: "Invitation revoked",
        empty: "No invitation outstanding.",
      },

      diskUsed: "On disk",
      wholeLibrary: "Whole library",
      fileCount: "Files",
      downloadCount: "Downloads",
      fetched: "Fetched",
      completedCount: "Completed",
      failedCount: "Failed",
      lastDownload: "Last download",
      never: "Never",
    },

    privacy: {
      title: "Private folder",
      description:
        "Hides your folder from other members in this interface. It is discretion, not secrecy: whoever runs the server still reaches the files on disk.",
      unavailable: "An administrator has not granted this permission.",
    },

    password: {
      title: "Password",
      description:
        "Changing it signs every other session out — that is the point of changing it after one may have leaked.",
      current: "Current password",
      new: "New password",
      submit: "Change password",
      changed: "Password changed",
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
        "password.reset": "Password reset link issued",
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
    /** Finished, waiting for the file to show up in the listing. */
    almostThere: "Finishing up",

    move: "Move",
    moveSelected: "Move selection",
    movePickerTitle: "Move to",
    destinationTitle: "Destination folder",
    chooseFolder: "Choose this folder",
    moveHere: "Move here",
    noSubfolders: "No subfolders",

    view: "View",
    viewGrid: "Grid",
    viewList: "List",
    columnName: "Name",
    columnSize: "Size",
    columnModified: "Modified",

    info: "Information",
    infoName: "Name",
    infoKind: "Kind",
    infoKindFolder: "Folder",
    infoKindFile: (ext: string) => (ext ? `${ext} file` : "File"),
    infoSize: "Size",
    infoContents: "Contents",
    infoContentsValue: (files: number, folders: number) =>
      `${files} file${files > 1 ? "s" : ""}, ${folders} folder${folders > 1 ? "s" : ""}`,
    infoModified: "Modified",
    infoLocation: "Location",
    infoLocationRoot: "Root",
  },

  // Errors the API returns about the request itself, keyed by its `code`.
  apiErrors: {
    accountLockedUntil: (when: string) =>
      `Too many failed attempts. This account is locked until ${when}.`,
    account_suspended: "This account has been suspended by an administrator.",
    file_too_large: "This download is larger than your account allows.",
    quota_exceeded: "This would go over your storage quota.",
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
    file_too_large:
      "Stopped: this download went over the size allowed for your account.",
    quota_exceeded:
      "Stopped: your storage quota is full. Free some space and try again.",
    network: "Network error while reaching the platform.",
    ffmpeg_missing: "ffmpeg was not found — it is required to merge streams.",
    unknown: "Download failed.",
  },
};
// No `as const` on purpose: literal types would force other locales to repeat
// the English strings verbatim instead of translating them.

export type Dictionary = typeof en;
