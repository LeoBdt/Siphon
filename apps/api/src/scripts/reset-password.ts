/**
 * Set a new password for an account, from the machine the instance runs on.
 *
 * The last door out of a locked instance. Everything else in Siphon is done
 * through the interface on purpose, but an administrator who has forgotten
 * their password cannot reach the interface — and a self-hosted app with no
 * way back in is one database edit away from being abandoned. There is no
 * email to send a reset link to, so the proof of ownership is access to the
 * server itself, which is the strongest one available here.
 *
 *   pnpm --filter @app/api reset-password                  # list the accounts
 *   pnpm --filter @app/api reset-password <username>       # generate one
 *   pnpm --filter @app/api reset-password <username> <pw>  # set one
 *
 * In Docker: docker compose exec api node --import tsx \
 *              apps/api/src/scripts/reset-password.ts <username>
 */
import { randomBytes } from "node:crypto";
import { MIN_PASSWORD_LENGTH } from "@app/shared";
import { db } from "../db.js";
import { hashPassword } from "../auth/password.js";

interface Row {
  id: string;
  username: string;
  displayName: string | null;
  groupId: string;
}

function accounts(): Row[] {
  return db
    .prepare(
      `SELECT id, username, displayName, groupId FROM users ORDER BY createdAt`,
    )
    .all() as unknown as Row[];
}

/**
 * A password that can be read over the shoulder and typed once.
 *
 * Not meant to be kept: it exists to get back in and change it. Ambiguous
 * characters are left out so nobody loses another ten minutes to an l/1.
 */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function list(): void {
  const rows = accounts();
  if (rows.length === 0) {
    console.log(
      "No account on this instance. Open Siphon and the first visitor creates one.",
    );
    return;
  }
  console.log("Accounts on this instance:\n");
  for (const row of rows) {
    const name = row.displayName ? ` (${row.displayName})` : "";
    const admin = row.groupId === "admin" ? "  [administrator]" : "";
    console.log(`  ${row.username}${name}${admin}`);
  }
  console.log("\nRun again with a username to set a new password for it.");
}

async function main(): Promise<void> {
  const [username, password] = process.argv.slice(2);
  if (!username) {
    list();
    return;
  }

  // COLLATE NOCASE, like signing in: someone typing their own name back is
  // not obliged to remember its capitalisation.
  const row = db
    .prepare(`SELECT id, username FROM users WHERE username = ? COLLATE NOCASE`)
    .get(username) as unknown as Row | undefined;
  if (!row) {
    console.error(`No account called "${username}".\n`);
    list();
    process.exitCode = 1;
    return;
  }

  if (password && password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `A password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
    process.exitCode = 1;
    return;
  }

  const chosen = password ?? generatePassword();
  db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(
    await hashPassword(chosen),
    row.id,
  );
  // A forgotten password may be a stolen one. Every existing session ends, and
  // the lockout counter is cleared so the new password works on the first try
  // rather than meeting a lock the old one earned.
  db.prepare(`DELETE FROM sessions WHERE userId = ?`).run(row.id);
  db.prepare(
    `UPDATE users SET failedAttempts = 0, lockedUntil = NULL, suspended = 0 WHERE id = ?`,
  ).run(row.id);

  console.log(`Password changed for ${row.username}.`);
  if (!password) console.log(`\n  ${chosen}\n`);
  console.log("Every session on that account has been signed out.");
  if (!password) {
    console.log("Change it from Settings › Profile once you are back in.");
  }
}

await main();
