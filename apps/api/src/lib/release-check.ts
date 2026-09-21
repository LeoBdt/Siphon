import type { ReleaseCheck } from "@app/shared";

const REPO = "LeoBdt/Siphon";
const ENDPOINT = `https://api.github.com/repos/${REPO}/releases/latest`;
/**
 * Fallback listing, newest first.
 *
 * `/releases/latest` has an opinion of its own: it ignores anything flagged as
 * a pre-release and answers 404, which the app could only report as "nothing
 * has ever been published" — while two releases sat on the repository. A
 * published release is a published release, so the list settles it.
 */
const LIST_ENDPOINT = `https://api.github.com/repos/${REPO}/releases?per_page=10`;

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

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
}

const GITHUB_HEADERS = {
  accept: "application/vnd.github+json",
  // GitHub asks for one and answers 403 without it.
  "user-agent": "siphon",
};

/**
 * One GitHub call, with its failures expressed as values.
 *
 * "missing" is kept apart from "error" because a 404 is an answer — there is
 * no such resource — while a timeout means we simply do not know.
 */
type Fetched<T> =
  | { kind: "ok"; body: T }
  | { kind: "missing" }
  | { kind: "error"; error: "unreachable" | "rate_limited" };

async function get<T>(url: string): Promise<Fetched<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: GITHUB_HEADERS,
      // A settings page should not hang on a slow network.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { kind: "error", error: "unreachable" };
  }
  if (res.status === 404) return { kind: "missing" };
  if (res.status === 403 || res.status === 429) {
    return { kind: "error", error: "rate_limited" };
  }
  if (!res.ok) return { kind: "error", error: "unreachable" };
  try {
    return { kind: "ok", body: (await res.json()) as T };
  } catch {
    return { kind: "error", error: "unreachable" };
  }
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

  const asked = await get<GithubRelease>(ENDPOINT);
  if (asked.kind === "error") return { ...base, error: asked.error };

  // A 404 on /releases/latest does not mean there is nothing published: it is
  // also the answer when every release is flagged as a pre-release. Ask for
  // the list before concluding.
  let body = asked.kind === "ok" ? asked.body : null;
  if (!body?.tag_name) {
    const listed = await get<GithubRelease[]>(LIST_ENDPOINT);
    if (listed.kind === "error") return { ...base, error: listed.error };
    body =
      listed.kind === "ok"
        ? (listed.body.find((r) => !r.draft && r.tag_name) ?? null)
        : null;
  }

  const tag = body?.tag_name?.trim();
  if (!tag || !body) return { ...base, error: "no_releases" };

  return {
    ...base,
    latest: tag.replace(/^v/i, ""),
    updateAvailable: compareVersions(tag, currentVersion) > 0,
    url: body.html_url ?? null,
    publishedAt: body.published_at ?? null,
  };
}
