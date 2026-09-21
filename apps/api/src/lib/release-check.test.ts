import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions } from "./release-check.js";

test("a newer version sorts above an older one", () => {
  assert.ok(compareVersions("0.4.0", "0.3.0") > 0);
  assert.ok(compareVersions("1.0.0", "0.9.9") > 0);
  assert.ok(compareVersions("0.3.1", "0.3.0") > 0);
});

test("an older or equal version never claims to be an update", () => {
  assert.ok(compareVersions("0.3.0", "0.3.0") === 0);
  assert.ok(compareVersions("0.2.9", "0.3.0") < 0);
  assert.ok(compareVersions("0.9.9", "1.0.0") < 0);
});

test("a leading v is ignored on either side", () => {
  // GitHub tags carry it, package.json does not.
  assert.equal(compareVersions("v0.3.0", "0.3.0"), 0);
  assert.ok(compareVersions("v0.4.0", "0.3.0") > 0);
});

test("versions compare numerically, not as text", () => {
  // The case a string comparison gets wrong: "10" sorts before "9".
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.ok(compareVersions("2.0.0", "10.0.0") < 0);
});

test("a missing or malformed part counts as zero", () => {
  // A garbled tag must never be able to announce a fictitious update.
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.ok(compareVersions("nonsense", "0.1.0") < 0);
  assert.equal(compareVersions("", "0.0.0"), 0);
});
