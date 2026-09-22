import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveOutputStem, sanitizeStem } from "./output-name.js";

test("sanitizeStem strips what a filesystem will not take", () => {
  // The separator and the colon each become a space, and the run collapses.
  assert.equal(sanitizeStem("AC/DC: Back in Black"), "AC DC Back in Black");
  assert.equal(sanitizeStem("a\u0000b"), "a b");
  assert.equal(sanitizeStem("  spaced  out  "), "spaced out");
});

test("sanitizeStem refuses leading and trailing dots", () => {
  // A leading dot hides the file; Windows drops trailing dots and spaces
  // without telling anyone, which would make the recorded name wrong.
  assert.equal(sanitizeStem(".hidden"), "hidden");
  assert.equal(sanitizeStem("trailing..."), "trailing");
});

test("sanitizeStem caps the length", () => {
  assert.equal(sanitizeStem("x".repeat(400)).length, 120);
});

test("a free name is used as it is", async () => {
  const dir = await mkdtemp(join(tmpdir(), "siphon-names-"));
  const { stem } = await reserveOutputStem(dir, "Song Title", "fallback");
  assert.equal(stem, "Song Title");
});

test("an existing file pushes the name to (2), whatever its extension", async () => {
  const dir = await mkdtemp(join(tmpdir(), "siphon-names-"));
  await writeFile(join(dir, "Song Title.m4a"), "");
  const { stem } = await reserveOutputStem(dir, "Song Title", "fallback");
  // Matching ignores the extension: an .mp4 must not quietly take the place
  // of the .m4a already sitting there.
  assert.equal(stem, "Song Title (2)");
});

test("a download in flight holds its name against the next one", async () => {
  const dir = await mkdtemp(join(tmpdir(), "siphon-names-"));
  // Nothing is on disk yet — the file only moves into place at the end — so
  // this is the case a directory listing cannot catch.
  const first = await reserveOutputStem(dir, "Same Title", "a");
  const second = await reserveOutputStem(dir, "Same Title", "b");
  assert.equal(first.stem, "Same Title");
  assert.equal(second.stem, "Same Title (2)");

  first.release();
  const third = await reserveOutputStem(dir, "Same Title", "c");
  assert.equal(third.stem, "Same Title");
});

test("a title that sanitizes to nothing falls back to the job id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "siphon-names-"));
  const { stem } = await reserveOutputStem(dir, "...", "job-123");
  assert.equal(stem, "job-123");
});
