import { test } from "node:test";
import assert from "node:assert/strict";
import { isTempArtifact } from "./cleanup.js";

test("isTempArtifact matches yt-dlp partial downloads", () => {
  assert.equal(isTempArtifact("Video [abc].mp4.part"), true);
  assert.equal(isTempArtifact("Video [abc].info.ytdl"), true);
  assert.equal(isTempArtifact("Video [abc].mp4.part-Frag12"), true);
  assert.equal(isTempArtifact("Video [abc].temp.mp4"), true);
});

test("isTempArtifact matches un-merged DASH streams", () => {
  // Left behind when ffmpeg never merged the separate video/audio tracks.
  assert.equal(isTempArtifact("TEDDY RINER [PulUuXgfb8E].f401.mp4"), true);
  assert.equal(isTempArtifact("TEDDY RINER [PulUuXgfb8E].f251.webm"), true);
  assert.equal(isTempArtifact("Track [x].f140.m4a"), true);
});

test("isTempArtifact leaves finished media alone", () => {
  assert.equal(isTempArtifact("Video [abc].mp4"), false);
  assert.equal(isTempArtifact("Track [abc].m4a"), false);
  assert.equal(isTempArtifact("Track [abc].mp3"), false);
  assert.equal(isTempArtifact("partition.mp4"), false);
  // A digit-suffixed name that is not a format id must survive.
  assert.equal(isTempArtifact("Concert 2024.mp4"), false);
});
