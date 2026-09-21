/**
 * Get back into an account, from the machine the instance runs on.
 *
 * The last door out of a locked instance. Everything else in Siphon happens in
 * the interface, but an administrator who has forgotten their password cannot
 * reach the interface — and a self-hosted app with no way back in is one
 * database edit away from being abandoned. There is no address to mail a link
 * to, so the proof of ownership is access to the server itself, which is the
 * strongest one available here.
 *
 * It prints a link by default rather than a password, for the same reason the
 * interface does: nobody else should ever hold someone's password, and a
 * password typed into a terminal lives on in the shell history.
 *
 *   pnpm --filter @app/api reset-password                    # list the accounts
 *   pnpm --filter @app/api reset-password <username>         # print a link
 *   pnpm --filter @app/api reset-password <username> --password <pw>
 *
 * In Docker: docker compose exec api node --import tsx \
 *              apps/api/src/scripts/reset-password.ts <username>
 */
import { MIN_PASSWORD_LENGTH } from "@app/shared";
import { db, getSetting } from "../db.js";
import { hashPassword } from "../auth/password.js";
import { createPasswordReset } from "../auth/store.js";

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
 * Where this instance is reached from a browser.
 *
 * The server cannot work it out: behind a proxy it only ever sees its own
 * container. The web app records the address an administrator actually uses,
 * so a link can be printed whole; failing that, the path is printed and the
 * operator knows their own address better than we do.
 */
function publicUrl(): string | null {
  const env = process.env.SIPHON_PUBLIC_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return getSetting("publicUrl");
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
  console.log("\nRun again with a username to get a password reset link.");
}

function findUser(username: string): Row | null {
  // COLLATE NOCASE, like signing in: someone typing their own name back is
  // not obliged to remember its capitalisation.
  return (
    (db
      .prepare(
        `SELECT id, username, displayName, groupId FROM users
         WHERE username = ? COLLATE NOCASE`,
      )
      .get(username) as unknown as Row | undefined) ?? null
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const username = args[0];
  const passwordFlag = args.indexOf("--password");
  const password = passwordFlag === -1 ? null : args[passwordFlag + 1];

  if (!username) {
    list();
    return;
  }

  const row = findUser(username);
  if (!row) {
    console.error(`No account called "${username}".\n`);
    list();
    process.exitCode = 1;
    return;
  }

  // The escape hatch from the escape hatch: no browser at all, or an
  // automated first run. Still never a password this script invented.
  if (password !== null) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      console.error(
        `A password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      process.exitCode = 1;
      return;
    }
    db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(
      await hashPassword(password),
      row.id,
    );
    db.prepare(`DELETE FROM sessions WHERE userId = ?`).run(row.id);
    db.prepare(
      `UPDATE users SET failedAttempts = 0, lockedUntil = NULL, suspended = 0 WHERE id = ?`,
    ).run(row.id);
    console.log(`Password set for ${row.username}.`);
    console.log("Every session on that account has been signed out.");
    return;
  }

  const { token, expiresAt } = createPasswordReset(row.id);
  // Suspension and lockout would make the new password useless the moment it
  // was chosen, so getting back in clears both.
  db.prepare(
    `UPDATE users SET failedAttempts = 0, lockedUntil = NULL, suspended = 0 WHERE id = ?`,
  ).run(row.id);

  const base = publicUrl();
  console.log(`A reset link for ${row.username}:\n`);
  if (base) {
    console.log(`  ${base}/reset/${token}\n`);
    console.log(
      "That address is the one Siphon was last opened on. If you reach it",
    );
    console.log("somewhere else, keep the path and change the host.");
  } else {
    console.log(`  /reset/${token}\n`);
    console.log(
      "Open it on whatever address you reach Siphon at, for example",
    );
    console.log(`  https://siphon.example.com/reset/${token}`);
    console.log(
      "\n(Set SIPHON_PUBLIC_URL, or open the Users settings once, and this",
    );
    console.log("prints the whole link.)");
  }
  console.log(
    `\nIt works once, and expires ${new Date(expiresAt).toLocaleString()}.`,
  );
}

await main();
