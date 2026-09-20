import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyYtdlpError,
  num,
  parseFileLine,
  parsePostprocessLine,
  parseProgressLine,
  phaseFromCodecs,
} from "./ytdlp-parse.js";

test("num parses numbers and treats NA/empty as null", () => {
  assert.equal(num("123"), 123);
  assert.equal(num("1.5"), 1.5);
  assert.equal(num("NA"), null);
  assert.equal(num(""), null);
  assert.equal(num("abc"), null);
});

test("phaseFromCodecs distinguishes video vs audio-only streams", () => {
  assert.equal(phaseFromCodecs("avc1", "none"), "downloading-video");
  assert.equal(phaseFromCodecs("none", "mp4a"), "downloading-audio");
  assert.equal(phaseFromCodecs("NA", "NA"), "downloading-video");
  assert.equal(phaseFromCodecs("", ""), "downloading-video");
});

test("parseProgressLine computes fractional progress from downloaded/total", () => {
  const p = parseProgressLine("[[PROG]]500;1000;NA;250000;4;avc1;none");
  assert.ok(p);
  assert.equal(p!.progress, 0.5);
  assert.equal(p!.speedBytesPerSec, 250000);
  assert.equal(p!.etaSeconds, 4);
  assert.equal(p!.phase, "downloading-video");
});

test("parseProgressLine falls back to total_bytes_estimate when total is NA", () => {
  const p = parseProgressLine("[[PROG]]250;NA;1000;NA;NA;none;mp4a");
  assert.ok(p);
  assert.equal(p!.progress, 0.25);
  assert.equal(p!.phase, "downloading-audio");
  assert.equal(p!.speedBytesPerSec, null);
});

test("parseProgressLine caps progress at 1 and yields null when total unknown", () => {
  assert.equal(parseProgressLine("[[PROG]]2000;1000;NA;1;1;avc1;none")!.progress, 1);
  assert.equal(parseProgressLine("[[PROG]]500;NA;NA;1;1;avc1;none")!.progress, null);
});

test("parseProgressLine returns null for non-progress lines", () => {
  assert.equal(parseProgressLine("[download] 12% of 3MiB"), null);
  assert.equal(parseProgressLine("[[FILE]]/tmp/x.mp4"), null);
});

test("parsePostprocessLine maps Merger to merging, else converting", () => {
  assert.equal(parsePostprocessLine("[[POST]]Merger"), "merging");
  assert.equal(parsePostprocessLine("[[POST]]ExtractAudio"), "converting");
  assert.equal(parsePostprocessLine("[[PROG]]1;2;3;4;5;a;b"), null);
});

test("parseFileLine extracts the output path", () => {
  assert.equal(parseFileLine("[[FILE]]/data/library/clip [id].mp4"), "/data/library/clip [id].mp4");
  assert.equal(parseFileLine("[[FILE]]   "), null);
  assert.equal(parseFileLine("random log line"), null);
});

test("classifyYtdlpError maps known yt-dlp failures to stable codes", () => {
  const code = (s: string) => classifyYtdlpError(s).code;
  assert.equal(code("ERROR: Private video. Sign in if you've been granted access"), "private_video");
  assert.equal(code("ERROR: Join this channel to get access to members-only content"), "members_only");
  assert.equal(code("ERROR: Video unavailable. This video has been removed"), "unavailable");
  assert.equal(code("ERROR: Sign in to confirm your age"), "age_restricted");
  assert.equal(code("ERROR: The uploader has not made this video available in your country"), "geo_blocked");
  assert.equal(code("ERROR: Sign in to confirm you're not a bot"), "bot_check");
  assert.equal(code("ERROR: Requested format is not available"), "no_format");
  assert.equal(code("ERROR: unable to download video data: <urlopen error timed out>"), "network");
  assert.equal(code("ERROR: ffmpeg not found. Please install"), "ffmpeg_missing");
});

test("classifyYtdlpError falls back to unknown with the last error line as detail", () => {
  const { code, detail } = classifyYtdlpError(
    [
      "[youtube] extracting",
      "WARNING: something",
      "ERROR: Something very specific broke",
    ].join("\n"),
  );
  assert.equal(code, "unknown");
  assert.match(detail, /Something very specific broke/);
});

test("classifyYtdlpError tolerates empty stderr", () => {
  assert.equal(classifyYtdlpError("").code, "unknown");
  assert.equal(classifyYtdlpError("   \n  ").detail, "");
});
