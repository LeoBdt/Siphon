import type { ApiErrorCode } from "@app/shared";

/**
 * Small client for the Fastify API.
 *
 * In production the default is an empty base: the deployment puts a reverse
 * proxy in front of both services, so the browser only ever talks to one
 * origin. That keeps the image portable — nothing about the host is baked in
 * at build time — and removes CORS entirely.
 *
 * In development the two dev servers are on separate ports, so we point at the
 * API directly. `NEXT_PUBLIC_API_URL` overrides either case.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "" : "http://localhost:3001");

function withSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/** The CSRF token the server handed us, readable because it is not HttpOnly. */
function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "siphon.csrf") return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${withSlash(path)}`;
}

export function wsUrl(path = "/ws"): string {
  const p = withSlash(path);
  if (API_BASE_URL) return `${API_BASE_URL.replace(/^http/, "ws")}${p}`;
  // Same-origin deployment: derive the socket URL from the page itself, so it
  // follows the scheme (wss behind TLS) and the port without being told.
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${p}`;
}

/** URL to stream a file (Range-enabled) for the in-app player. */
export function streamUrl(path: string): string {
  return apiUrl(`/api/files/stream?path=${encodeURIComponent(path)}`);
}

/** URL to download a file (attachment) or folder (zip). */
export function downloadUrl(path: string): string {
  return apiUrl(`/api/files/download?path=${encodeURIComponent(path)}`);
}

/**
 * Error thrown by `apiFetch`. `code` is the API's stable classification when it
 * sent one, so the UI can render the message in the active language instead of
 * showing the server's English fallback.
 */
export class ApiError extends Error {
  readonly code?: ApiErrorCode;
  readonly status: number;
  /** For a locked account: when it opens again, so the UI can say so. */
  readonly lockedUntil?: string;
  /**
   * For a size or quota refusal: the figures behind it, and whether going
   * ahead is on offer. The interface needs the numbers to say "2.3 GB, your
   * limit is 1 GB" rather than something vague.
   */
  readonly limitBytes?: number;
  readonly estimatedBytes?: number | null;
  readonly canOverride?: boolean;

  constructor(
    message: string,
    status: number,
    code?: ApiErrorCode,
    extra?: {
      lockedUntil?: string;
      limitBytes?: number;
      estimatedBytes?: number | null;
      canOverride?: boolean;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.lockedUntil = extra?.lockedUntil;
    this.limitBytes = extra?.limitBytes;
    this.estimatedBytes = extra?.estimatedBytes;
    this.canOverride = extra?.canOverride;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.text().catch(() => "");
  let message = "";
  let code: ApiErrorCode | undefined;
  let extra: {
    lockedUntil?: string;
    limitBytes?: number;
    estimatedBytes?: number | null;
    canOverride?: boolean;
  } = {};
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      message?: string;
      code?: ApiErrorCode;
      lockedUntil?: string;
      limitBytes?: number;
      estimatedBytes?: number | null;
      canOverride?: boolean;
    };
    message = parsed.error ?? parsed.message ?? "";
    code = parsed.code;
    extra = {
      lockedUntil: parsed.lockedUntil,
      limitBytes: parsed.limitBytes,
      estimatedBytes: parsed.estimatedBytes,
      canOverride: parsed.canOverride,
    };
  } catch {
    // Not JSON — fall through to the generic message below.
  }
  if (!message) {
    if (res.status === 404) message = "Not found";
    else if (res.status >= 500) message = "The server hit an error";
    else message = body.trim() || `Error ${res.status}`;
  }
  return new ApiError(message, res.status, code, extra);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Only advertise a JSON body when we actually send one — Fastify rejects a
  // POST with `Content-Type: application/json` and an empty body (400).
  const headers: HeadersInit = {
    ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
    // Double-submit: the server compares this with the cookie it set. A
    // cross-site request can make the browser send the cookie, but it cannot
    // read it, so it cannot produce this header.
    ...(csrfToken() ? { "x-csrf-token": csrfToken()! } : {}),
    ...init?.headers,
  };
  // The session cookie has to ride along. Same-origin would send it anyway,
  // but in development the API answers on another port, and a cross-origin
  // fetch drops cookies unless asked.
  const res = await fetch(apiUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  // A 204 carries no body, and `res.json()` on an empty one throws — which
  // made every successful delete look like a failure: the row was gone on the
  // server, the interface showed an error and never refreshed. Deleting a
  // member, revoking an invitation, removing a job and deleting a file all
  // answer 204.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
