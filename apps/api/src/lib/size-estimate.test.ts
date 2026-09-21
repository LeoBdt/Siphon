import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBytes, parseFormats } from "./size-estimate.js";

const FORMATS = parseFormats({
  formats: [
    // Video-only, as YouTube serves anything above 360p.
    { height: 1080, fps: 30, vcodec: "avc1", acodec: "none", filesize: 900 },
    { height: 720, fps: 30, vcodec: "avc1", acodec: "none", filesize: 500 },
    { height: 360, fps: 30, vcodec: "avc1", acodec: "mp4a", filesize: 300 },
    // Audio-only.
    { height: null, fps: null, vcodec: "none", acodec: "mp4a", filesize: 100 },
    { height: null, fps: null, vcodec: "none", acodec: "opus", filesize_approx: 80 },
  ],
});

test("parseFormats keeps the fields we reason about", () => {
  assert.equal(FORMATS.length, 5);
  assert.equal(FORMATS[0]?.height, 1080);
  assert.equal(FORMATS[4]?.filesizeApprox, 80);
  assert.equal(FORMATS[4]?.filesize, null);
});

test("a video estimate adds the best video and audio streams", () => {
  const { bytes, exact } = estimateBytes(FORMATS);
  assert.equal(bytes, 1000); // 900 video + 100 audio
  assert.equal(exact, true);
});

test("a height cap excludes the formats above it", () => {
  assert.equal(estimateBytes(FORMATS, { maxHeight: 720 }).bytes, 600);
  // The 360p format is progressive — it already carries its audio — so its
  // own size is the whole answer, with nothing added to it.
  assert.equal(estimateBytes(FORMATS, { maxHeight: 360 }).bytes, 300);
});

test("an audio preset estimates the audio stream alone", () => {
  assert.equal(estimateBytes(FORMATS, { audioOnly: true }).bytes, 100);
});

test("an approximate part makes the whole estimate approximate", () => {
  const approx = parseFormats({
    formats: [
      { height: 1080, vcodec: "avc1", acodec: "none", filesize_approx: 900 },
      { vcodec: "none", acodec: "mp4a", filesize: 100 },
    ],
  });
  const { bytes, exact } = estimateBytes(approx);
  assert.equal(bytes, 1000);
  // This is what keeps a limit from refusing a download on a guess.
  assert.equal(exact, false);
});

test("no size anywhere yields no estimate rather than zero", () => {
  const blind = parseFormats({
    formats: [{ height: 1080, vcodec: "avc1", acodec: "none" }],
  });
  assert.deepEqual(estimateBytes(blind), { bytes: null, exact: false });
  assert.deepEqual(estimateBytes(parseFormats({})), { bytes: null, exact: false });
});

test("a missing formats array is not a crash", () => {
  assert.deepEqual(parseFormats(null), []);
  assert.deepEqual(parseFormats({ formats: "nonsense" }), []);
});
