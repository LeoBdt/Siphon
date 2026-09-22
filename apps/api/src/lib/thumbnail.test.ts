import { test } from "node:test";
import assert from "node:assert/strict";
import { canThumbnail } from "./thumbnail.js";

test("previews are offered for the media the app produces", () => {
  assert.equal(canThumbnail("Song.m4a"), true);
  assert.equal(canThumbnail("Clip.mp4"), true);
  assert.equal(canThumbnail("Photo.JPG"), true);
});

test("anything else keeps its icon", () => {
  // A 404 from the thumbnail route means "use the icon", so this is the
  // difference between asking the server pointlessly and not asking at all.
  assert.equal(canThumbnail("Subtitles.srt"), false);
  assert.equal(canThumbnail("notes"), false);
  assert.equal(canThumbnail("archive.zip"), false);
});
