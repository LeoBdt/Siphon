import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { PathError, resolveInsideRoot, toRel } from "./paths.js";

/**
 * The sandbox, exercised against a base that is *not* the library root — the
 * case a confined member hits on every request.
 */
const BASE = resolve("/tmp/library/users/alice");

test("a confined member's paths resolve inside their own folder", () => {
  assert.equal(resolveInsideRoot("", BASE), BASE);
  assert.equal(resolveInsideRoot("clips", BASE), resolve(BASE, "clips"));
  assert.equal(
    resolveInsideRoot("clips/a.mp4", BASE),
    resolve(BASE, "clips/a.mp4"),
  );
});

test("traversal cannot reach another member's folder", () => {
  assert.throws(() => resolveInsideRoot("../bob", BASE), PathError);
  assert.throws(() => resolveInsideRoot("../../library", BASE), PathError);
  assert.throws(() => resolveInsideRoot("clips/../../bob", BASE), PathError);
});

test("backslashes cannot smuggle a level up", () => {
  // String.raw: a plain "..\b" in source is an escape sequence, not a path.
  // Writing it the other way is how an earlier version of this test ended up
  // asserting against a backspace character and passing for the wrong reason.
  assert.throws(() => resolveInsideRoot(String.raw`..\bob`, BASE), PathError);
  assert.throws(
    () => resolveInsideRoot(String.raw`clips\..\..\bob`, BASE),
    PathError,
  );
});

test("an absolute path is neutralised rather than obeyed", () => {
  // Leading slashes are stripped, so "/etc/passwd" is read as a relative path
  // and lands inside the member's own folder. It never escapes, which is what
  // matters — rejecting it outright would only be cosmetic.
  assert.equal(
    resolveInsideRoot("/etc/passwd", BASE),
    resolve(BASE, "etc/passwd"),
  );
});

test("a sibling folder sharing the name prefix is not inside", () => {
  // "alice-2" starts with "alice" as a string but is a different directory.
  assert.throws(
    () => resolveInsideRoot("../alice-2/secret.mp4", BASE),
    PathError,
  );
});

test("paths handed back are relative to the member's own root", () => {
  // A confined member must never see a path that names the users directory.
  assert.equal(toRel(resolve(BASE, "clips/a.mp4"), BASE), "clips/a.mp4");
});
