import type { FastifyInstance } from "fastify";
import type {
  Group,
  PermissionOverrides,
  Permissions,
  User,
} from "@app/shared";
import type { AuditEntry, Invite, UserStats } from "@app/shared";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { listAudit, record } from "../auth/audit.js";
import { downloadStatsFor } from "../db.js";
import { dirUsage } from "../lib/dir-size.js";
import { resolveInsideRoot } from "../lib/paths.js";
import {
  GROUP_ADMIN_ID,
  GROUP_MEMBER_ID,
  MIN_PASSWORD_LENGTH,
} from "@app/shared";
import { requirePermission } from "../auth/guard.js";
import {
  clearLoginFailures,
  createGroup,
  createInvite,
  deleteGroup,
  deleteUser,
  getUser,
  listGroups,
  listInvites,
  listUsers,
  reconcilePrivacy,
  revokeInvite,
  setSuspended,
  updateGroup,
  updateUser,
} from "../auth/store.js";

/** Members and groups. Every route here is administrators only. */
export async function adminRoutes(app: FastifyInstance) {
  const adminOnly = { preHandler: requirePermission("isAdmin") };

  // --- Members -------------------------------------------------------------

  app.get("/api/admin/users", adminOnly, async (): Promise<User[]> =>
    listUsers(),
  );

  /**
   * Invitations, rather than creating accounts outright.
   *
   * The invitee picks their own username and password: an administrator has no
   * business choosing someone's handle, and should never hold their password.
   */
  app.get("/api/admin/invites", adminOnly, async (): Promise<Invite[]> =>
    listInvites(),
  );

  app.post("/api/admin/invites", adminOnly, async (req) => {
    const { groupId } = (req.body ?? {}) as { groupId?: string };
    const invite = createInvite(groupId ?? GROUP_MEMBER_ID);
    record({
      action: "invite.created",
      actorId: req.user?.id,
      actorName: req.user?.username,
      target: invite.groupName,
      ip: req.ip,
    });
    return invite;
  });

  app.delete("/api/admin/invites/:token", adminOnly, async (req, reply) => {
    const { token } = req.params as { token: string };
    record({
      action: "invite.revoked",
      actorId: req.user?.id,
      actorName: req.user?.username,
      ip: req.ip,
    });
    if (!revokeInvite(token)) {
      return reply.code(404).send({ code: "not_found", error: "Not found" });
    }
    return reply.code(204).send();
  });

  app.patch("/api/admin/users/:id", adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      username?: string;
      password?: string;
      groupId?: string;
      overrides?: Partial<PermissionOverrides>;
    };
    if (body.password && body.password.length < MIN_PASSWORD_LENGTH) {
      return reply.code(400).send({
        code: "weak_password",
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    // Do not let the last administrator strip their own powers: the instance
    // would be left with nobody able to manage it.
    const target = getUser(id);
    if (!target) {
      return reply.code(404).send({ code: "not_found", error: "Not found" });
    }
    const losingAdmin =
      target.effective.isAdmin &&
      ((body.groupId && body.groupId !== GROUP_ADMIN_ID) ||
        body.overrides?.isAdmin === false);
    if (losingAdmin && listUsers().filter((u) => u.effective.isAdmin).length <= 1) {
      return reply.code(409).send({
        code: "last_admin",
        error: "This is the only administrator",
      });
    }

    const updated = await updateUser(id, body);
    record({
      action: body.password ? "password.changed" : "user.updated",
      actorId: req.user?.id,
      actorName: req.user?.username,
      target: target.username,
      ip: req.ip,
    });
    // Losing the permission has to actually un-hide the folder, and leave a
    // notice behind rather than let them find out by accident.
    reconcilePrivacy();
    return getUser(id) ?? (updated as never) ??
      reply.code(404).send({ code: "not_found", error: "Not found" });
  });

  /**
   * Lift a lock the system applied after failed sign-ins.
   *
   * Separate from un-suspending: an administrator should be able to see that
   * the account was shut by a counter rather than by a colleague, and clear it
   * without having to reason about a decision nobody made.
   */
  app.post("/api/admin/users/:id/unlock", adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const target = getUser(id);
    if (!target) {
      return reply.code(404).send({ code: "not_found", error: "Not found" });
    }
    clearLoginFailures(id);
    record({
      action: "user.updated",
      actorId: req.user?.id,
      actorName: req.user?.username,
      target: target.username,
      ip: req.ip,
    });
    return getUser(id);
  });

  /** Shut an account, or open it again. */
  app.post("/api/admin/users/:id/suspend", adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { suspended } = (req.body ?? {}) as { suspended?: boolean };

    // An administrator locking themselves out, or the last one locking the
    // instance out of its own administration, is never what was meant.
    if (id === req.user?.id) {
      return reply.code(409).send({
        code: "self_delete",
        error: "You cannot suspend your own account",
      });
    }
    const target = getUser(id);
    if (!target) {
      return reply.code(404).send({ code: "not_found", error: "Not found" });
    }
    if (
      suspended &&
      target.effective.isAdmin &&
      listUsers().filter((u) => u.effective.isAdmin && !u.suspended).length <= 1
    ) {
      return reply.code(409).send({
        code: "last_admin",
        error: "This is the only administrator",
      });
    }

    const updated = setSuspended(id, Boolean(suspended));
    record({
      action: "user.updated",
      actorId: req.user?.id,
      actorName: req.user?.username,
      target: target.username,
      ip: req.ip,
    });
    return updated;
  });

  app.delete("/api/admin/users/:id", adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.user?.id) {
      return reply.code(409).send({
        code: "self_delete",
        error: "You cannot delete your own account",
      });
    }
    const victim = getUser(id);
    if (!victim) {
      return reply.code(404).send({ code: "not_found", error: "Not found" });
    }
    if (!deleteUser(id)) {
      return reply.code(409).send({
        code: "last_admin",
        error: "This is the only administrator",
      });
    }
    return reply.code(204).send();
  });

  /**
   * What one member is using and has fetched.
   *
   * Disk usage is walked from their folder rather than summed from the job
   * rows: files can be deleted, moved in from elsewhere, or left over from a
   * job whose record was removed, and the number an administrator needs is
   * what is on the disk now. The job counts answer a different question — how
   * much has gone through the app — so both are reported.
   */
  app.get("/api/admin/users/:id/stats", adminOnly, async (req, reply): Promise<UserStats | undefined> => {
    const { id } = req.params as { id: string };
    const target = getUser(id);
    if (!target) {
      reply.code(404).send({ code: "not_found", error: "Not found" });
      return undefined;
    }
    // An administrator's own "folder" is the whole library, since that is what
    // they browse; reporting it would restate the disk gauge on the same page.
    const scoped = !target.effective.canBrowseWholeLibrary;
    const usage = scoped
      ? await dirUsage(join(config.rootDir, "users", target.libraryDir))
      : { bytes: 0, files: 0, folders: 0 };
    return {
      userId: id,
      scoped,
      diskBytes: usage.bytes,
      fileCount: usage.files,
      folderCount: usage.folders,
      ...downloadStatsFor(id),
    };
  });

  app.get("/api/admin/audit", adminOnly, async (req): Promise<AuditEntry[]> => {
    const { before, limit } = req.query as { before?: string; limit?: string };
    return listAudit(Math.min(Number(limit) || 100, 500), before);
  });

  // --- Groups --------------------------------------------------------------

  app.get("/api/admin/groups", adminOnly, async (): Promise<Group[]> =>
    listGroups(),
  );

  app.post("/api/admin/groups", adminOnly, async (req, reply) => {
    const body = (req.body ?? {}) as {
      name?: string;
      permissions?: Permissions;
    };
    if (!body.name?.trim()) {
      return reply
        .code(400)
        .send({ code: "invalid_name", error: "Name required" });
    }
    return createGroup(body.name.trim(), body.permissions ?? ({} as Permissions));
  });

  app.patch("/api/admin/groups/:id", adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      name?: string;
      permissions?: Partial<Permissions>;
    };
    const updated = updateGroup(id, body);
    record({
      action: "group.updated",
      actorId: req.user?.id,
      actorName: req.user?.username,
      target: updated?.name ?? id,
      ip: req.ip,
    });
    // A group edit moves everyone in it at once.
    reconcilePrivacy();
    return updated ?? reply.code(404).send({ code: "not_found", error: "Not found" });
  });

  app.delete("/api/admin/groups/:id", adminOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!deleteGroup(id)) {
      return reply.code(409).send({
        code: "group_in_use",
        error: "Built-in groups and groups with members cannot be deleted",
      });
    }
    return reply.code(204).send();
  });
}
