import { test } from "node:test";
import assert from "node:assert/strict";
import { killPlan } from "./kill-tree.js";

test("on Windows the whole tree is killed by pid", () => {
  const plan = killPlan("win32", 4242);
  assert.equal(plan.kind, "taskkill");
  assert.equal(plan.kind === "taskkill" && plan.command, "taskkill");
  // /t is what reaches the ffmpeg yt-dlp spawned; without it a cancel during
  // the merge left the conversion running and the job never settled.
  assert.deepEqual(
    plan.kind === "taskkill" ? plan.args : [],
    ["/pid", "4242", "/t", "/f"],
  );
});

test("elsewhere the process group is signalled, not the child alone", () => {
  for (const platform of ["linux", "darwin"] as const) {
    const plan = killPlan(platform, 4242);
    assert.equal(plan.kind, "group");
    // Negative: the group the child was given by spawning detached.
    assert.equal(plan.kind === "group" && plan.signalPid, -4242);
  }
});
