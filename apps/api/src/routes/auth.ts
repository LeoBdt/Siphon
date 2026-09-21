import type { FastifyInstance } from "fastify";
import type { AuthState, Credentials, InvitePreview, User } from "@app/shared";
import { GROUP_ADMIN_ID, MAX_DISPLAY_NAME, MIN_PASSWORD_LENGTH } from "@app/shared";
import { verifyPassword } from "../auth/password.js";
import {
  clearAttempts,
  clearSessionCookie,
  recordFailure,
  setSessionCookie,
  tooManyAttempts,
} from "../auth/guard.js";
import { record } from "../auth/audit.js";
import { generateSecret, otpauthUri, verifyCode } from "../auth/totp.js";
import {
  acceptInvite,
  clearLoginFailures,
  clearNotice,
  disableTotp,
  enableTotp,
  createSession,
  createUser,
  findByUsername,
  lockedUntil,
  pendingNotice,
  previewInvite,
  recordLoginFailure,
  revokeSession,
  setDisplayName,
  setPrivateFolder,
  stageTotpSecret,
  totpSecretOf,
  userCount,
} from "../auth/store.js";

export async function authRoutes(app: FastifyInstance) {
  /** Who is signed in, and whether the instance still needs its first account. */
  app.get("/api/auth/state", async (req): Promise<AuthState> => ({
    needsSetup: userCount() === 0,
    user: req.user ?? null,
    notice: req.user ? pendingNotice(req.user.id) : null,
  }));

  /**
   * One's own profile.
   *
   * Deliberately not the admin route with a self check bolted on: this one
   * cannot touch a group, a permission or anyone else's account, so there is
   * no rule to get wrong. Today it holds the display name; a password change
   * for oneself belongs here too.
   */
  app.patch("/api/auth/profile", async (req, reply) => {
    if (!req.user) {
      return reply
        .code(401)
        .send({ code: "unauthenticated", error: "Sign in required" });
    }
    const { displayName } = (req.body ?? {}) as { displayName?: string | null };
    if (displayName !== undefined && typeof displayName !== "string" && displayName !== null) {
      return reply
        .code(400)
        .send({ code: "invalid_name", error: "Name must be text" });
    }
    if (typeof displayName === "string" && displayName.length > MAX_DISPLAY_NAME) {
      return reply.code(400).send({
        code: "invalid_name",
        error: `Name must be at most ${MAX_DISPLAY_NAME} characters`,
      });
    }
    const updated = setDisplayName(req.user.id, displayName ?? null);
    record({
      action: "user.updated",
      actorId: req.user.id,
      actorName: req.user.username,
      target: req.user.username,
      ip: req.ip,
    });
    return updated;
  });

  /** Acknowledge a one-off notice so it stops being shown. */
  app.post("/api/auth/notice/dismiss", async (req) => {
    if (req.user) clearNotice(req.user.id);
    return { ok: true };
  });

  /**
   * Turn one's own folder privacy on or off.
   *
   * Refused when the permission is absent, so the switch cannot be flipped by
   * calling the endpoint directly.
   */
  app.post("/api/auth/private-folder", async (req, reply) => {
    if (!req.user) {
      return reply
        .code(401)
        .send({ code: "unauthenticated", error: "Sign in required" });
    }
    const { enabled } = (req.body ?? {}) as { enabled?: boolean };
    if (enabled && !req.user.effective.canHavePrivateFolder) {
      return reply.code(403).send({ code: "forbidden", error: "Not allowed" });
    }
    return setPrivateFolder(req.user.id, Boolean(enabled));
  });

  /**
   * First run. Open only while there is no account at all — the moment one
   * exists this route refuses, so it cannot be used to mint a second
   * administrator.
   *
   * No default credentials anywhere: a known default stays exploitable for the
   * whole window between starting the app and configuring it, and that window
   * is always longer than people expect.
   */
  app.post("/api/auth/setup", async (req, reply) => {
    if (userCount() > 0) {
      return reply
        .code(409)
        .send({ code: "already_setup", error: "Already configured" });
    }
    const { username, password, displayName } = (req.body ?? {}) as Partial<Credentials>;
    if (!username?.trim()) {
      return reply
        .code(400)
        .send({ code: "invalid_credentials", error: "Username required" });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({
        code: "weak_password",
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const user = await createUser({
      username: username.trim(),
      password,
      // The first account is a person too: without a name, every invitation
      // they send later would have nobody to attribute it to.
      displayName: displayName?.slice(0, MAX_DISPLAY_NAME) ?? null,
      groupId: GROUP_ADMIN_ID,
    });
    const session = createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt, session.csrfToken);
    return user satisfies User;
  });

  /** What an invitee may see before accepting: nothing but the group name. */
  app.get("/api/auth/invite/:token", async (req): Promise<InvitePreview> => {
    const { token } = req.params as { token: string };
    return previewInvite(token);
  });

  app.post("/api/auth/invite/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const { username, password, displayName } = (req.body ?? {}) as Partial<Credentials>;
    if (!username?.trim()) {
      return reply
        .code(400)
        .send({ code: "invalid_credentials", error: "Username required" });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({
        code: "weak_password",
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }
    let user;
    try {
      user = await acceptInvite(
        token,
        username.trim(),
        password,
        displayName?.slice(0, MAX_DISPLAY_NAME) ?? null,
      );
    } catch {
      return reply
        .code(409)
        .send({ code: "already_exists", error: "Username already taken" });
    }
    if (!user) {
      return reply
        .code(404)
        .send({ code: "not_found", error: "This invitation is no longer valid" });
    }
    const session = createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt, session.csrfToken);
    return user;
  });

  app.post("/api/auth/login", async (req, reply) => {
    const { username, password, code } = (req.body ?? {}) as Partial<
      Credentials & { code: string }
    >;
    const key = `${req.ip}:${(username ?? "").toLowerCase()}`;

    if (tooManyAttempts(key)) {
      return reply.code(429).send({
        code: "too_many_attempts",
        error: "Too many attempts. Try again later.",
      });
    }

    const found = username ? findByUsername(username) : null;

    // Told plainly: a locked account is the one case where silence would send
    // someone to reset a password that was never the problem.
    if (found?.user.suspended) {
      return reply.code(403).send({
        code: "account_suspended",
        error: "This account has been suspended",
      });
    }

    if (found) {
      const until = lockedUntil(found.user.id);
      if (until) {
        return reply
          .code(423)
          .send({ code: "account_locked", error: "Account locked", lockedUntil: until });
      }
    }

    const ok =
      found && password
        ? await verifyPassword(password, found.passwordHash)
        : false;

    if (!ok || !found) {
      recordFailure(key);
      if (found) {
        const until = recordLoginFailure(found.user.id);
        record({
          action: until ? "login.locked" : "login.failed",
          actorId: found.user.id,
          actorName: found.user.username,
          ip: req.ip,
        });
        if (until) {
          return reply.code(423).send({
            code: "account_locked",
            error: "Account locked",
            lockedUntil: until,
          });
        }
      } else {
        record({ action: "login.failed", actorName: username ?? null, ip: req.ip });
      }
      // One message for both cases: saying which half was wrong tells an
      // attacker which usernames exist.
      return reply.code(401).send({
        code: "invalid_credentials",
        error: "Wrong username or password",
      });
    }

    // Second factor, when the account has one.
    if (found.user.totpEnabled) {
      const secret = totpSecretOf(found.user.id);
      if (!code) {
        return reply
          .code(401)
          .send({ code: "totp_required", error: "Authentication code required" });
      }
      if (!secret || !verifyCode(secret, code)) {
        recordFailure(key);
        recordLoginFailure(found.user.id);
        record({
          action: "login.failed",
          actorId: found.user.id,
          actorName: found.user.username,
          ip: req.ip,
        });
        return reply
          .code(401)
          .send({ code: "totp_invalid", error: "Wrong authentication code" });
      }
    }

    clearAttempts(key);
    clearLoginFailures(found.user.id);
    record({
      action: "login.success",
      actorId: found.user.id,
      actorName: found.user.username,
      ip: req.ip,
    });
    const session = createSession(found.user.id);
    setSessionCookie(reply, session.id, session.expiresAt, session.csrfToken);
    return found.user satisfies User;
  });

  // --- Second factor, for one's own account --------------------------------

  /** Stage a secret. Nothing changes until a code proves the app has it. */
  app.post("/api/auth/totp/setup", async (req, reply) => {
    if (!req.user) {
      return reply
        .code(401)
        .send({ code: "unauthenticated", error: "Sign in required" });
    }
    const secret = generateSecret();
    stageTotpSecret(req.user.id, secret);
    return { secret, uri: otpauthUri(secret, req.user.username) };
  });

  app.post("/api/auth/totp/enable", async (req, reply) => {
    if (!req.user) {
      return reply
        .code(401)
        .send({ code: "unauthenticated", error: "Sign in required" });
    }
    const { code } = (req.body ?? {}) as { code?: string };
    const secret = totpSecretOf(req.user.id);
    if (!secret || !code || !verifyCode(secret, code)) {
      return reply
        .code(400)
        .send({ code: "totp_invalid", error: "Wrong authentication code" });
    }
    enableTotp(req.user.id);
    record({
      action: "totp.enabled",
      actorId: req.user.id,
      actorName: req.user.username,
      ip: req.ip,
    });
    return { ok: true };
  });

  /** Turning it off asks for the password: a borrowed session must not suffice. */
  app.post("/api/auth/totp/disable", async (req, reply) => {
    if (!req.user) {
      return reply
        .code(401)
        .send({ code: "unauthenticated", error: "Sign in required" });
    }
    const { password } = (req.body ?? {}) as { password?: string };
    const found = findByUsername(req.user.username);
    if (!found || !password || !(await verifyPassword(password, found.passwordHash))) {
      return reply.code(401).send({
        code: "invalid_credentials",
        error: "Wrong password",
      });
    }
    disableTotp(req.user.id);
    record({
      action: "totp.disabled",
      actorId: req.user.id,
      actorName: req.user.username,
      ip: req.ip,
    });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    if (req.user) {
      record({
        action: "logout",
        actorId: req.user.id,
        actorName: req.user.username,
        ip: req.ip,
      });
    }
    if (req.sessionId) revokeSession(req.sessionId);
    clearSessionCookie(reply);
    return { ok: true };
  });
}
