import { test } from "node:test";
import assert from "node:assert/strict";
import type { User } from "@app/shared";
import { mayTouchJob } from "./ownership.js";

/** Just enough of a user for the predicate; the rest is irrelevant to it. */
const who = (id: string, isAdmin = false) =>
  ({ id, effective: { isAdmin } }) as Pick<User, "id" | "effective">;

const alice = who("u_alice");
const bob = who("u_bob");
const admin = who("u_admin", true);

test("a member may touch their own job", () => {
  assert.equal(mayTouchJob({ userId: "u_alice" }, alice), true);
});

test("a member may not touch someone else's job", () => {
  // The case that mattered: before this, knowing an id was enough to cancel,
  // retry or delete a stranger's download.
  assert.equal(mayTouchJob({ userId: "u_bob" }, alice), false);
  assert.equal(mayTouchJob({ userId: "u_alice" }, bob), false);
});

test("an administrator may touch any job", () => {
  assert.equal(mayTouchJob({ userId: "u_alice" }, admin), true);
  assert.equal(mayTouchJob({ userId: null }, admin), true);
});

test("an ownerless job is not up for grabs", () => {
  // Jobs from before accounts existed belong to the administrator, not to
  // whoever asks first.
  assert.equal(mayTouchJob({ userId: null }, alice), false);
});

test("no session means no access", () => {
  assert.equal(mayTouchJob({ userId: "u_alice" }, undefined), false);
  assert.equal(mayTouchJob({ userId: null }, null), false);
});

test("a missing job is refused rather than assumed", () => {
  assert.equal(mayTouchJob(null, admin), false);
  assert.equal(mayTouchJob(undefined, alice), false);
});
