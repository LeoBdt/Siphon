import { test } from "node:test";
import assert from "node:assert/strict";
import { presetToArgs } from "./ytdlp.js";

/** The `-f` selector, which is what actually decides what gets downloaded. */
function selector(args: string[]): string {
  return args[args.indexOf("-f") + 1] ?? "";
}

test("presets cap resolution and leave frame rate alone", () => {
  // No cap at all: yt-dlp picks the best stream, 60 fps included.
  assert.equal(selector(presetToArgs("best")), "bv*+ba/b");

  const p1080 = selector(presetToArgs("1080p"));
  assert.match(p1080, /height<=1080/);
  assert.doesNotMatch(p1080, /fps/);

  assert.match(selector(presetToArgs("2160p")), /height<=2160/);
});

test("the retired 1080p60 preset still replays as recorded", () => {
  // Dropped from the UI, but history rows still carry it: a retry has to
  // download what it downloaded the first time, not silently something else.
  const s = selector(presetToArgs("1080p60"));
  assert.match(s, /height<=1080/);
  assert.match(s, /fps<=60/);
});

test("advanced overrides win over the preset", () => {
  const s = selector(presetToArgs("1080p", { maxHeight: 720, maxFps: 30 }));
  assert.match(s, /height<=720/);
  assert.match(s, /fps<=30/);
});

test("audio presets pick the original source to avoid re-encoding", () => {
  assert.match(selector(presetToArgs("audio-m4a")), /ba\[ext=m4a\]/);
  assert.match(selector(presetToArgs("audio-opus")), /ba\[ext=webm\]/);
  // MP3 is always a re-encode: no source can be remuxed into it.
  assert.ok(presetToArgs("audio-mp3").includes("--audio-format"));
});
