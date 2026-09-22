import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFields } from "./audit-diff.js";

test("only the fields the patch mentions are compared", () => {
  // A patch says what it means to change; reporting every other field as
  // unchanged would bury the one thing that did.
  const changes = diffFields(
    { name: "Members", canDownload: true },
    { name: "Guests" },
  );
  assert.deepEqual(changes, [{ field: "name", from: "Members", to: "Guests" }]);
});

test("a field sent back unchanged is not an event", () => {
  assert.deepEqual(diffFields({ name: "Members" }, { name: "Members" }), []);
});

test("absent and false are told apart", () => {
  // "Inherited" and "explicitly denied" are different states in this model,
  // and a log that conflates them answers the wrong question.
  assert.deepEqual(diffFields({}, { canDownload: false }), [
    { field: "canDownload", from: null, to: "false" },
  ]);
  assert.deepEqual(diffFields({ canDownload: false }, { canDownload: null }), [
    { field: "canDownload", from: "false", to: null },
  ]);
});

test("skipped fields are never recorded", () => {
  assert.deepEqual(
    diffFields({ password: "a" }, { password: "b" }, ["password"]),
    [],
  );
});

test("nothing to compare yields nothing", () => {
  assert.deepEqual(diffFields(undefined, undefined), []);
});
