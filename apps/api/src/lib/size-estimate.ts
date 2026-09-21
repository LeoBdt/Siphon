/**
 * How big a download is going to be, before it happens.
 *
 * "You only know the size at the end" is half true: yt-dlp reports a size per
 * format when it probes, exactly for some and approximately for most. That is
 * enough to refuse a download that certainly breaks a limit, and to warn about
 * one that probably does — while the progress lines remain the thing that
 * actually enforces it, since they carry the real total.
 *
 * Pure on purpose: it takes the parsed JSON yt-dlp already gives us, so it can
 * be tested against real payloads without a subprocess or a network.
 */

export interface FormatSummary {
  height: number | null;
  fps: number | null;
  vcodec: string;
  acodec: string;
  /** Known exactly, because the server said so in a Content-Length. */
  filesize: number | null;
  /** yt-dlp's own estimate, from the bitrate and the duration. */
  filesizeApprox: number | null;
}

export interface SizeEstimate {
  bytes: number | null;
  /**
   * Whether every part of it was a measured size rather than an estimate.
   *
   * This is what decides whether a limit is enforced up front or merely
   * warned about: refusing on a guess would block downloads that turn out to
   * fit, and a "download anyway" button that the server kills moments later
   * is not a choice, it is a trap.
   */
  exact: boolean;
}

const NONE = new Set(["none", "NA", "", null, undefined]);

function has(codec: string | null | undefined): boolean {
  return !NONE.has(codec ?? "");
}

function sizeOf(f: FormatSummary): { bytes: number; exact: boolean } | null {
  if (typeof f.filesize === "number" && f.filesize > 0) {
    return { bytes: f.filesize, exact: true };
  }
  if (typeof f.filesizeApprox === "number" && f.filesizeApprox > 0) {
    return { bytes: f.filesizeApprox, exact: false };
  }
  return null;
}

/** Pull the fields we care about out of yt-dlp's `formats` array. */
export function parseFormats(data: unknown): FormatSummary[] {
  const raw = (data as { formats?: unknown })?.formats;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const f = entry as Record<string, unknown>;
    return {
      height: typeof f.height === "number" ? f.height : null,
      fps: typeof f.fps === "number" ? f.fps : null,
      vcodec: typeof f.vcodec === "string" ? f.vcodec : "none",
      acodec: typeof f.acodec === "string" ? f.acodec : "none",
      filesize: typeof f.filesize === "number" ? f.filesize : null,
      filesizeApprox:
        typeof f.filesize_approx === "number" ? f.filesize_approx : null,
    };
  });
}

/**
 * The largest plausible size for what a given preset would fetch.
 *
 * Deliberately pessimistic: among the formats that satisfy the caps, it takes
 * the biggest, because yt-dlp's selector asks for the best available and a
 * limit that is only sometimes right is worse than one that errs high.
 */
export function estimateBytes(
  formats: FormatSummary[],
  opts: { audioOnly?: boolean; maxHeight?: number | null; maxFps?: number | null } = {},
): SizeEstimate {
  const sized = formats
    .map((f) => ({ f, size: sizeOf(f) }))
    .filter((x): x is { f: FormatSummary; size: { bytes: number; exact: boolean } } =>
      x.size !== null,
    );
  if (sized.length === 0) return { bytes: null, exact: false };

  const audioStreams = sized.filter((x) => has(x.f.acodec) && !has(x.f.vcodec));
  const biggest = (list: typeof sized) =>
    list.reduce<(typeof sized)[number] | null>(
      (best, x) => (!best || x.size.bytes > best.size.bytes ? x : best),
      null,
    );

  if (opts.audioOnly) {
    // An extraction re-encodes at best; the source is the honest upper bound.
    const pick = biggest(audioStreams) ?? biggest(sized);
    return pick
      ? { bytes: pick.size.bytes, exact: pick.size.exact }
      : { bytes: null, exact: false };
  }

  const fits = (x: (typeof sized)[number]) =>
    (opts.maxHeight == null || (x.f.height ?? 0) <= opts.maxHeight) &&
    (opts.maxFps == null || (x.f.fps ?? 0) <= opts.maxFps);

  const videoStreams = sized.filter((x) => has(x.f.vcodec) && fits(x));
  // A progressive format carries both tracks, so it is a whole answer on its
  // own; separate video and audio streams have to be added together.
  const progressive = biggest(
    videoStreams.filter((x) => has(x.f.acodec)),
  );
  const videoOnly = biggest(videoStreams.filter((x) => !has(x.f.acodec)));
  const audio = biggest(audioStreams);

  const combined =
    videoOnly && audio
      ? {
          bytes: videoOnly.size.bytes + audio.size.bytes,
          exact: videoOnly.size.exact && audio.size.exact,
        }
      : null;

  const candidates = [
    combined,
    progressive ? { bytes: progressive.size.bytes, exact: progressive.size.exact } : null,
    videoOnly ? { bytes: videoOnly.size.bytes, exact: false } : null,
  ].filter((c): c is { bytes: number; exact: boolean } => c !== null);

  if (candidates.length === 0) return { bytes: null, exact: false };
  return candidates.reduce((best, c) => (c.bytes > best.bytes ? c : best));
}
