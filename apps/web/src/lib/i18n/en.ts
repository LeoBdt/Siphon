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

    ytdlp: {
      title: "yt-dlp",
      description:
        "The download engine. Update it regularly — YouTube changes often and breaks older versions.",
      installed: "Installed version",
      action: "Check for updates",
      checked: "yt-dlp checked",
      failed: "yt-dlp update failed",
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

    selected: (n: number) => `${n} selected`,
    selectAll: "Select all",
    clearSelection: "Clear selection",
    downloadSelected: "Download selection",
    deleteSelected: "Delete selection",
    downloadingHere: "Downloading",
  },

  // Errors the API returns about the request itself, keyed by its `code`.
  apiErrors: {
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
