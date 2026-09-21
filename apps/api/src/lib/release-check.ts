import type { ReleaseCheck } from "@app/shared";

const REPO = "LeoBdt/Siphon";
const ENDPOINT = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * Compare two `MAJOR.MINOR.PATCH` strings.
 *
 * Deliberately not a semver dependency: this compares two numbers the project
 * writes itself, and pre-release suffixes are not used. Anything unparseable
 * sorts as 0, so a malformed tag can never claim to be newer than a real one.
 *
 * Returns a positive number when `a` is newer than `b`.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Ask GitHub whether a newer release exists.
 *
 * Unauthenticated, which allows 60 requests an hour per address — far beyond
 * what a button pressed by hand will ever use, and it keeps a token out of the
 * deployment. Failures come back as a value rather than an exception: "GitHub
 * is unreachable" is an answer the interface should show, not an error page.
 */
export async function checkLatestRelease(
  currentVersion: string,
): Promise<ReleaseCheck> {
  const base: ReleaseCheck = {
    current: currentVersion,
    latest: null,
    updateAvailable: false,
    url: null,
    publishedAt: null,
    error: null,
  };

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      headers: {
        accept: "application/vnd.github+json",
        // GitHub asks for one and answers 403 without it.
        "user-agent": "siphon",
      },
      // A settings page should not hang on a slow network.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ...base, error: "unreachable" };
  }

  // 404 means the repository has no published release yet, which is not a
  // failure — it is the honest state of a project that has not tagged one.
  if (res.status === 404) return { ...base, error: "no_releases" };
  if (res.status === 403 || res.status === 429) {
    return { ...base, error: "rate_limited" };
  }
  if (!res.ok) return { ...base, error: "unreachable" };

  let body: { tag_name?: string; html_url?: string; published_at?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ...base, error: "unreachable" };
  }

  const tag = body.tag_name?.trim();
  if (!tag) return { ...base, error: "no_releases" };

  return {
    ...base,
    latest: tag.replace(/^v/i, ""),
    updateAvailable: compareVersions(tag, currentVersion) > 0,
    url: body.html_url ?? null,
    publishedAt: body.published_at ?? null,
  };
}
