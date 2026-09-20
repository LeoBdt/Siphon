import { randomBytes, randomUUID } from "node:crypto";
import type {
  Group,
  Invite,
  InvitePreview,
  Permissions,
  PermissionOverrides,
  User,
} from "@app/shared";
import { GROUP_ADMIN_ID, GROUP_MEMBER_ID } from "@app/shared";
import { db } from "../db.js";
import { hashPassword } from "./password.js";

/**
 * Accounts, groups and sessions.
 *
 * Permissions live in two layers: a group carries the defaults, a user may
 * override any single field. An override left null means "inherit", which is
 * what lets editing a group take effect for everyone who has not been singled
 * out individually.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    builtIn     INTEGER NOT NULL DEFAULT 0,
    permissions TEXT NOT NULL,
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    groupId      TEXT NOT NULL REFERENCES groups(id),
    overrides    TEXT NOT NULL DEFAULT '{}',
    -- Folder name under ROOT_DIR/users. Held apart from the username so
    -- renaming an account never orphans its files, and so a name that is
    -- illegal or ambiguous on a filesystem cannot reach the disk.
    libraryDir   TEXT NOT NULL,
    privateFolder INTEGER NOT NULL DEFAULT 0,
    -- Failed sign-ins since the last success, and how long the account is shut
    -- for. Persisted rather than held in memory: a counter that a restart
    -- clears is a counter an attacker can clear.
    failedAttempts INTEGER NOT NULL DEFAULT 0,
    lockedUntil   TEXT,
    -- Optional second factor. The secret is only ever read by the server.
    totpSecret    TEXT,
    totpEnabled   INTEGER NOT NULL DEFAULT 0,
    suspended     INTEGER NOT NULL DEFAULT 0,
    -- Set when privacy was withdrawn from under them; cleared once shown.
    noticePrivacyRevoked INTEGER NOT NULL DEFAULT 0,
    createdAt    TEXT NOT NULL,
    lastSeenAt   TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id        TEXT PRIMARY KEY,
    userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

  CREATE TABLE IF NOT EXISTS invites (
    token     TEXT PRIMARY KEY,
    groupId   TEXT NOT NULL REFERENCES groups(id),
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    usedAt    TEXT
  );
`);

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Everything off: the floor a group is built up from. */
const NONE: Permissions = {
  canDownload: false,
  canKeepInLibrary: false,
  canManageFiles: false,
  canManageSettings: false,
  isAdmin: false,
  canHavePrivateFolder: false,
  canBrowseWholeLibrary: false,
  maxConcurrentDownloads: null,
  quotaBytes: null,
};

const ADMIN: Permissions = {
  canDownload: true,
  canKeepInLibrary: true,
  canManageFiles: true,
  canManageSettings: true,
  isAdmin: true,
  canHavePrivateFolder: true,
  canBrowseWholeLibrary: true,
  maxConcurrentDownloads: null,
  quotaBytes: null,
};

/** What an ordinary member may do out of the box: download and keep, nothing more. */
const MEMBER: Permissions = {
  ...NONE,
  canDownload: true,
  canKeepInLibrary: true,
  canManageFiles: true,
  canHavePrivateFolder: true,
};

const PERMISSION_KEYS = Object.keys(NONE) as (keyof Permissions)[];

/** Group defaults with the user's own values laid over them. */
export function resolvePermissions(
  group: Permissions,
  overrides: Partial<PermissionOverrides>,
): Permissions {
  const out = { ...group };
  for (const key of PERMISSION_KEYS) {
    const value = overrides[key];
    if (value !== null && value !== undefined) {
      // Each key keeps its own type; the cast is the price of iterating them.
      (out as Record<string, unknown>)[key] = value;
    }
  }
  // An administrator is not a bundle of flags that could be half-granted.
  return out.isAdmin ? { ...out, ...ADMIN } : out;
}

function parsePermissions(json: string): Permissions {
  try {
    return { ...NONE, ...(JSON.parse(json) as Partial<Permissions>) };
  } catch {
    return { ...NONE };
  }
}

function parseOverrides(json: string): PermissionOverrides {
  const empty = Object.fromEntries(
    PERMISSION_KEYS.map((k) => [k, null]),
  ) as PermissionOverrides;
  try {
    return { ...empty, ...(JSON.parse(json) as Partial<PermissionOverrides>) };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

interface GroupRow {
  id: string;
  name: string;
  builtIn: number;
  permissions: string;
  createdAt: string;
}

function seedGroups(): void {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO groups (id, name, builtIn, permissions, createdAt)
     VALUES (?, ?, 1, ?, ?)`,
  );
  insert.run(GROUP_ADMIN_ID, "Administrators", JSON.stringify(ADMIN), now);
  insert.run(GROUP_MEMBER_ID, "Members", JSON.stringify(MEMBER), now);
}
seedGroups();

export function listGroups(): Group[] {
  const rows = db
    .prepare(
      `SELECT g.*, (SELECT COUNT(*) FROM users u WHERE u.groupId = g.id) AS memberCount
       FROM groups g ORDER BY g.builtIn DESC, g.name`,
    )
    .all() as unknown as (GroupRow & { memberCount: number })[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    builtIn: r.builtIn === 1,
    permissions: parsePermissions(r.permissions),
    memberCount: r.memberCount,
  }));
}

export function getGroup(id: string): Group | null {
  return listGroups().find((g) => g.id === id) ?? null;
}

export function createGroup(name: string, permissions: Permissions): Group {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO groups (id, name, builtIn, permissions, createdAt)
     VALUES (?, ?, 0, ?, ?)`,
  ).run(id, name, JSON.stringify({ ...NONE, ...permissions }), new Date().toISOString());
  return getGroup(id)!;
}

export function updateGroup(
  id: string,
  patch: { name?: string; permissions?: Partial<Permissions> },
): Group | null {
  const current = getGroup(id);
  if (!current) return null;
  // The Administrators group must keep its powers, or an instance can be left
  // with nobody able to administer it.
  const permissions =
    id === GROUP_ADMIN_ID
      ? ADMIN
      : { ...current.permissions, ...(patch.permissions ?? {}) };
  db.prepare(`UPDATE groups SET name = ?, permissions = ? WHERE id = ?`).run(
    patch.name ?? current.name,
    JSON.stringify(permissions),
    id,
  );
  return getGroup(id);
}

export function deleteGroup(id: string): boolean {
  const group = getGroup(id);
  if (!group || group.builtIn || group.memberCount > 0) return false;
  db.prepare(`DELETE FROM groups WHERE id = ?`).run(id);
  return true;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  groupId: string;
  overrides: string;
  libraryDir: string;
  privateFolder: number;
  noticePrivacyRevoked: number;
  totpEnabled: number;
  suspended: number;
  lockedUntil: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

/**
 * A filesystem-safe folder name derived from a username, made unique.
 *
 * Anything outside a conservative set becomes a dash: usernames are free-form,
 * but this string ends up as a real directory on someone's disk.
 */
export function libraryDirFor(username: string): string {
  const base =
    username
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 40) || "user";
  let candidate = base;
  let n = 2;
  const taken = db.prepare(`SELECT 1 FROM users WHERE libraryDir = ?`);
  while (taken.get(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}

function toUser(row: UserRow): User {
  const group = getGroup(row.groupId) ?? getGroup(GROUP_MEMBER_ID)!;
  const overrides = parseOverrides(row.overrides);
  return {
    id: row.id,
    username: row.username,
    groupId: group.id,
    groupName: group.name,
    overrides,
    effective: resolvePermissions(group.permissions, overrides),
    privateFolder: row.privateFolder === 1,
    totpEnabled: row.totpEnabled === 1,
    suspended: row.suspended === 1,
    // An expired lock is no lock: report it as open rather than making every
    // caller compare dates.
    lockedUntil:
      row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()
        ? row.lockedUntil
        : null,
    libraryDir: row.libraryDir,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  };
}

export function userCount(): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as unknown as { n: number };
  return row.n;
}

export function listUsers(): User[] {
  const rows = db
    .prepare(`SELECT * FROM users ORDER BY createdAt`)
    .all() as unknown as UserRow[];
  return rows.map(toUser);
}

export function getUser(id: string): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as unknown as UserRow | undefined;
  return row ? toUser(row) : null;
}

/** The folder a user's files live in, relative to ROOT_DIR. */
export function libraryDirOf(id: string): string | null {
  const row = db.prepare(`SELECT libraryDir FROM users WHERE id = ?`).get(id) as unknown as { libraryDir: string } | undefined;
  return row ? `users/${row.libraryDir}` : null;
}

export async function createUser(opts: {
  username: string;
  password: string;
  groupId: string;
  overrides?: Partial<PermissionOverrides>;
}): Promise<User> {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, passwordHash, groupId, overrides, libraryDir, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    opts.username,
    await hashPassword(opts.password),
    opts.groupId,
    JSON.stringify(opts.overrides ?? {}),
    libraryDirFor(opts.username),
    new Date().toISOString(),
  );
  return getUser(id)!;
}

export async function updateUser(
  id: string,
  patch: {
    username?: string;
    password?: string;
    groupId?: string;
    overrides?: Partial<PermissionOverrides>;
  },
): Promise<User | null> {
  const current = getUser(id);
  if (!current) return null;

  if (patch.username) {
    db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(
      patch.username,
      id,
    );
  }
  if (patch.password) {
    db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(
      await hashPassword(patch.password),
      id,
    );
    // Changing a password ends every other session: that is the point of
    // changing it after one may have leaked.
    revokeUserSessions(id);
  }
  if (patch.groupId) {
    db.prepare(`UPDATE users SET groupId = ? WHERE id = ?`).run(patch.groupId, id);
  }
  if (patch.overrides) {
    db.prepare(`UPDATE users SET overrides = ? WHERE id = ?`).run(
      JSON.stringify({ ...current.overrides, ...patch.overrides }),
      id,
    );
  }
  return getUser(id);
}

export function deleteUser(id: string): boolean {
  // Refuse to remove the last administrator, which would lock everyone out.
  const admins = listUsers().filter((u) => u.effective.isAdmin);
  if (admins.length === 1 && admins[0]?.id === id) return false;
  db.prepare(`DELETE FROM sessions WHERE userId = ?`).run(id);
  const info = db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  return info.changes > 0;
}

export function findByUsername(
  username: string,
): { user: User; passwordHash: string } | null {
  const row = db
    .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username) as unknown as UserRow | undefined;
  return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Long enough that guessing one is hopeless. */
const SESSION_DAYS = 30;

export function createSession(userId: string): {
  id: string;
  expiresAt: Date;
  csrfToken: string;
} {
  const id = randomBytes(32).toString("base64url");
  // Unrelated to the session id: the token is readable by the page, the id
  // never is, so deriving one from the other would defeat the point.
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare(
    `INSERT INTO sessions (id, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`,
  ).run(id, userId, new Date().toISOString(), expiresAt.toISOString());
  return { id, expiresAt, csrfToken };
}

export function userForSession(sessionId: string): User | null {
  const row = db
    .prepare(`SELECT userId, expiresAt FROM sessions WHERE id = ?`)
    .get(sessionId) as unknown as { userId: string; expiresAt: string } | undefined;
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    revokeSession(sessionId);
    return null;
  }
  db.prepare(`UPDATE users SET lastSeenAt = ? WHERE id = ?`).run(
    new Date().toISOString(),
    row.userId,
  );
  return getUser(row.userId);
}

export function revokeSession(id: string): void {
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
}

export function revokeUserSessions(userId: string): void {
  db.prepare(`DELETE FROM sessions WHERE userId = ?`).run(userId);
}

/** Drop expired rows at boot so the table does not grow without bound. */
export function pruneSessions(): void {
  db.prepare(`DELETE FROM sessions WHERE expiresAt < ?`).run(
    new Date().toISOString(),
  );
}

// ---------------------------------------------------------------------------
// Private folders
// ---------------------------------------------------------------------------

/** Turn privacy on or off for one member, within what they are allowed. */
export function setPrivateFolder(id: string, wanted: boolean): User | null {
  const user = getUser(id);
  if (!user) return null;
  const allowed = wanted && user.effective.canHavePrivateFolder;
  db.prepare(`UPDATE users SET privateFolder = ? WHERE id = ?`).run(
    allowed ? 1 : 0,
    id,
  );
  return getUser(id);
}

/**
 * Bring privacy flags back in line with permissions.
 *
 * Called after any change to a user or a group: withdrawing the permission has
 * to actually un-hide the folder, and the member has to be told rather than
 * discover it. Run over everyone because a group edit moves many at once.
 */
export function reconcilePrivacy(): void {
  const rows = db
    .prepare(`SELECT id, privateFolder FROM users`)
    .all() as unknown as { id: string; privateFolder: number }[];
  const clear = db.prepare(
    `UPDATE users SET privateFolder = 0, noticePrivacyRevoked = 1 WHERE id = ?`,
  );
  for (const row of rows) {
    if (row.privateFolder !== 1) continue;
    const user = getUser(row.id);
    if (user && !user.effective.canHavePrivateFolder) clear.run(row.id);
  }
}

/** The pending notice for a member, if any. */
export function pendingNotice(id: string): "privacy_revoked" | null {
  const row = db
    .prepare(`SELECT noticePrivacyRevoked FROM users WHERE id = ?`)
    .get(id) as unknown as { noticePrivacyRevoked: number } | undefined;
  return row?.noticePrivacyRevoked === 1 ? "privacy_revoked" : null;
}

export function clearNotice(id: string): void {
  db.prepare(`UPDATE users SET noticePrivacyRevoked = 0 WHERE id = ?`).run(id);
}

/** Folder names, relative to ROOT_DIR, that a given viewer must not see. */
export function hiddenDirsFor(viewer: User): Set<string> {
  if (viewer.effective.isAdmin && viewer.effective.canBrowseWholeLibrary) {
    // Even an administrator does not see them listed; the interface is honest
    // that this is not enforcement, only discretion.
  }
  const rows = db
    .prepare(`SELECT id, libraryDir FROM users WHERE privateFolder = 1`)
    .all() as unknown as { id: string; libraryDir: string }[];
  return new Set(
    rows.filter((r) => r.id !== viewer.id).map((r) => r.libraryDir),
  );
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

const INVITE_DAYS = 7;

interface InviteRow {
  token: string;
  groupId: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export function createInvite(groupId: string): Invite {
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000);
  db.prepare(
    `INSERT INTO invites (token, groupId, createdAt, expiresAt) VALUES (?, ?, ?, ?)`,
  ).run(token, groupId, now.toISOString(), expiresAt.toISOString());
  return {
    token,
    groupId,
    groupName: getGroup(groupId)?.name ?? groupId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/** Invitations still worth showing: unused and unexpired. */
export function listInvites(): Invite[] {
  const rows = db
    .prepare(
      `SELECT * FROM invites WHERE usedAt IS NULL AND expiresAt > ? ORDER BY createdAt DESC`,
    )
    .all(new Date().toISOString()) as unknown as InviteRow[];
  return rows.map((r) => ({
    token: r.token,
    groupId: r.groupId,
    groupName: getGroup(r.groupId)?.name ?? r.groupId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}

export function revokeInvite(token: string): boolean {
  return db.prepare(`DELETE FROM invites WHERE token = ?`).run(token).changes > 0;
}

function usableInvite(token: string): InviteRow | null {
  const row = db.prepare(`SELECT * FROM invites WHERE token = ?`).get(token) as
    | unknown as InviteRow
    | undefined;
  if (!row || row.usedAt) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;
  return row;
}

export function previewInvite(token: string): InvitePreview {
  const row = usableInvite(token);
  return row
    ? { valid: true, groupName: getGroup(row.groupId)?.name ?? null }
    : { valid: false, groupName: null };
}

/** Accept an invitation, creating the account the invitee named themselves. */
export async function acceptInvite(
  token: string,
  username: string,
  password: string,
): Promise<User | null> {
  const row = usableInvite(token);
  if (!row) return null;
  const user = await createUser({
    username,
    password,
    groupId: row.groupId,
  });
  // Single use: marked spent only once the account exists, so a failed
  // signup — a taken username, say — leaves the link usable.
  db.prepare(`UPDATE invites SET usedAt = ? WHERE token = ?`).run(
    new Date().toISOString(),
    token,
  );
  return user;
}

// ---------------------------------------------------------------------------
// Lockout
// ---------------------------------------------------------------------------

/** Failures tolerated before an account is shut, and for how long. */
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;

/** When the account is locked until, or null if it is open. */
export function lockedUntil(userId: string): string | null {
  const row = db
    .prepare(`SELECT lockedUntil FROM users WHERE id = ?`)
    .get(userId) as unknown as { lockedUntil: string | null } | undefined;
  if (!row?.lockedUntil) return null;
  if (new Date(row.lockedUntil).getTime() <= Date.now()) {
    // The lock has run out; clear it so the next attempt starts fresh.
    db.prepare(
      `UPDATE users SET lockedUntil = NULL, failedAttempts = 0 WHERE id = ?`,
    ).run(userId);
    return null;
  }
  return row.lockedUntil;
}

/**
 * Count a failure, and lock the account once there have been too many.
 *
 * Locking also ends every live session: if someone is guessing at a password,
 * an already-open session on that account is not something to leave running.
 */
export function recordLoginFailure(userId: string): string | null {
  const row = db
    .prepare(`SELECT failedAttempts FROM users WHERE id = ?`)
    .get(userId) as unknown as { failedAttempts: number } | undefined;
  const count = (row?.failedAttempts ?? 0) + 1;

  if (count < MAX_FAILURES) {
    db.prepare(`UPDATE users SET failedAttempts = ? WHERE id = ?`).run(count, userId);
    return null;
  }

  const until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
  db.prepare(
    `UPDATE users SET failedAttempts = ?, lockedUntil = ? WHERE id = ?`,
  ).run(count, until, userId);
  revokeUserSessions(userId);
  return until;
}

export function clearLoginFailures(userId: string): void {
  db.prepare(
    `UPDATE users SET failedAttempts = 0, lockedUntil = NULL WHERE id = ?`,
  ).run(userId);
}

// ---------------------------------------------------------------------------
// Second factor
// ---------------------------------------------------------------------------

/**
 * Shut an account, or open it again.
 *
 * Suspending ends every live session: leaving one running would make the
 * suspension take effect only at the next sign-in, which is not what anyone
 * means by suspending an account.
 */
export function setSuspended(id: string, suspended: boolean): User | null {
  db.prepare(`UPDATE users SET suspended = ? WHERE id = ?`).run(
    suspended ? 1 : 0,
    id,
  );
  if (suspended) revokeUserSessions(id);
  return getUser(id);
}

/** The stored secret, whether or not it has been confirmed yet. */
export function totpSecretOf(userId: string): string | null {
  const row = db
    .prepare(`SELECT totpSecret FROM users WHERE id = ?`)
    .get(userId) as unknown as { totpSecret: string | null } | undefined;
  return row?.totpSecret ?? null;
}

/** Stage a secret. It does nothing until a valid code confirms it works. */
export function stageTotpSecret(userId: string, secret: string): void {
  db.prepare(
    `UPDATE users SET totpSecret = ?, totpEnabled = 0 WHERE id = ?`,
  ).run(secret, userId);
}

export function enableTotp(userId: string): void {
  db.prepare(`UPDATE users SET totpEnabled = 1 WHERE id = ?`).run(userId);
}

export function disableTotp(userId: string): void {
  db.prepare(
    `UPDATE users SET totpSecret = NULL, totpEnabled = 0 WHERE id = ?`,
  ).run(userId);
}

/** Folder names of members who have turned privacy on. */
export function privateDirs(): Set<string> {
  const rows = db
    .prepare(`SELECT libraryDir FROM users WHERE privateFolder = 1`)
    .all() as unknown as { libraryDir: string }[];
  return new Set(rows.map((r) => r.libraryDir));
}
