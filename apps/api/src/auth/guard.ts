import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permissions, User } from "@app/shared";
import { userForSession } from "./store.js";

/**
 * Session cookie handling and route protection.
 *
 * Everything under /api requires a session except the auth endpoints and the
 * health probe. That deliberately includes the WebSocket and the file streaming
 * route — the two that are usually left open so a <video> tag keeps working,
 * and the two that would hand an anonymous visitor the whole library.
 */

export const SESSION_COOKIE = "siphon.sid";
/** Readable by JavaScript on purpose — the client has to echo it back. */
export const CSRF_COOKIE = "siphon.csrf";
const CSRF_HEADER = "x-csrf-token";

declare module "fastify" {
  interface FastifyRequest {
    user?: User;
    sessionId?: string;
  }
}

/** Paths reachable without a session. */
const PUBLIC = new Set([
  "/health",
  "/api/auth/state",
  "/api/auth/login",
  "/api/auth/setup",
]);

/** Prefixes reachable without a session — accepting an invitation. */
const PUBLIC_PREFIXES = ["/api/auth/invite/"];

export function readSessionCookie(req: FastifyRequest): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function readCookie(req: FastifyRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function setSessionCookie(
  reply: FastifyReply,
  id: string,
  expiresAt: Date,
  csrfToken: string,
): void {
  // `Secure` only behind TLS: setting it unconditionally would make the cookie
  // vanish on the plain-HTTP LAN deployments this app is usually run on.
  const secure = reply.request.protocol === "https" ? "; Secure" : "";
  const expires = expiresAt.toUTCString();
  reply.header("set-cookie", [
    `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}${secure}`,
    // Deliberately not HttpOnly: the point of a double-submit token is that the
    // page can read it and send it back in a header, which a cross-site request
    // cannot do — it can ride the cookie, but it cannot read it.
    `${CSRF_COOKIE}=${csrfToken}; Path=/; SameSite=Lax; Expires=${expires}${secure}`,
  ]);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header("set-cookie", [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    `${CSRF_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`,
  ]);
}

/**
 * Double-submit check on anything that changes state.
 *
 * SameSite=Lax already blocks most of this, but it is one browser setting away
 * from not applying, and older browsers ignore it entirely. A token the page
 * must read and echo cannot be produced by a site that is merely able to make
 * the browser send cookies.
 */
function csrfValid(req: FastifyRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.headers[CSRF_HEADER];
  return Boolean(cookie) && cookie === header;
}

/** Attaches the signed-in user, and refuses anonymous access to the rest. */
export async function authHook(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const sessionId = readSessionCookie(req);
  if (sessionId) {
    const user = userForSession(sessionId);
    if (user) {
      req.user = user;
      req.sessionId = sessionId;
    }
  }

  const path = req.url.split("?")[0] ?? "";
  if (PUBLIC.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;
  if (!req.user) {
    return reply
      .code(401)
      .send({ code: "unauthenticated", error: "Sign in required" });
  }
  if (!csrfValid(req)) {
    return reply
      .code(403)
      .send({ code: "csrf_failed", error: "Request could not be verified" });
  }
}

/** Guard for a single route: `preHandler: requirePermission("canDownload")`. */
export function requirePermission(permission: keyof Permissions) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    if (req.user?.effective[permission]) return;
    return reply
      .code(403)
      .send({ code: "forbidden", error: "Not allowed" });
  };
}

// ---------------------------------------------------------------------------
// Login throttling
// ---------------------------------------------------------------------------

/**
 * A password that survives ten guesses survives a hundred; one that does not,
 * falls in minutes without this. Kept in memory on purpose — a self-hosted
 * instance has one process, and a restart clearing the counters is a far
 * smaller problem than a dependency to maintain.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

export function tooManyAttempts(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
