import type { ApiErrorCode } from "@app/shared";

/**
 * Small client for the Fastify API. The base URL is configurable so the same
 * build works locally and once deployed behind a reverse proxy on the VPS.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function wsUrl(path = "/ws"): string {
  const base = API_BASE_URL.replace(/^http/, "ws");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
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

  constructor(message: string, status: number, code?: ApiErrorCode) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.text().catch(() => "");
  let message = "";
  let code: ApiErrorCode | undefined;
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      message?: string;
      code?: ApiErrorCode;
    };
    message = parsed.error ?? parsed.message ?? "";
    code = parsed.code;
  } catch {
    // Not JSON — fall through to the generic message below.
  }
  if (!message) {
    if (res.status === 404) message = "Not found";
    else if (res.status >= 500) message = "The server hit an error";
    else message = body.trim() || `Error ${res.status}`;
  }
  return new ApiError(message, res.status, code);
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Only advertise a JSON body when we actually send one — Fastify rejects a
  // POST with `Content-Type: application/json` and an empty body (400).
  const headers: HeadersInit = {
    ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
    ...init?.headers,
  };
  const res = await fetch(apiUrl(path), { ...init, headers });
  if (!res.ok) {
    throw await toApiError(res);
  }
  return res.json() as Promise<T>;
}
