import { test } from "node:test";
import assert from "node:assert/strict";
import { join, sep } from "node:path";
import { config } from "../config.js";
import {
  PathError,
  normalizeRel,
  resolveExistingInsideRoot,
  resolveInsideRoot,
  toRel,
} from "./paths.js";

const ROOT = config.rootDir;

test("normalizeRel converts backslashes and trims stray slashes", () => {
  assert.equal(normalizeRel("a\\b\\c"), "a/b/c");
  assert.equal(normalizeRel("/a/b/"), "a/b");
  assert.equal(normalizeRel("///x///"), "x");
  assert.equal(normalizeRel(""), "");
});

test("resolveInsideRoot('') returns the root itself", () => {
  assert.equal(resolveInsideRoot(""), ROOT);
});

test("resolveInsideRoot keeps ordinary nested paths inside the sandbox", () => {
  assert.equal(resolveInsideRoot("a/b"), join(ROOT, "a", "b"));
  // Traversal that stays inside is fine.
  assert.equal(resolveInsideRoot("a/../b"), join(ROOT, "b"));
});

test("resolveInsideRoot rejects parent-directory traversal", () => {
  assert.throws(() => resolveInsideRoot("../secret"), PathError);
  assert.throws(() => resolveInsideRoot("../../etc/passwd"), PathError);
  assert.throws(() => resolveInsideRoot("a/../../../x"), PathError);
});

test("resolveInsideRoot rejects backslash traversal (Windows-style)", () => {
  assert.throws(() => resolveInsideRoot("..\\..\\secret"), PathError);
});

test("resolveInsideRoot rejects a sibling dir sharing the root prefix", () => {
  // e.g. ROOT + "-evil" must not pass the startsWith check.
  const sibling = "../" + (ROOT.split(sep).pop() ?? "root") + "-evil/x";
  assert.throws(() => resolveInsideRoot(sibling), PathError);
});

test("resolveExistingInsideRoot returns the checked path when it doesn't exist", () => {
  const p = resolveExistingInsideRoot("does/not/exist/here.txt");
  assert.equal(p, join(ROOT, "does", "not", "exist", "here.txt"));
});

test("resolveExistingInsideRoot still rejects traversal", () => {
  assert.throws(() => resolveExistingInsideRoot("../../etc"), PathError);
});

test("toRel round-trips an absolute path to forward-slash relative form", () => {
  assert.equal(toRel(join(ROOT, "sub", "file.mp4")), "sub/file.mp4");
});
