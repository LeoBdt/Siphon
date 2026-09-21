import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBeforeDownload, checkWhileRunning, selectionFor } from "./limits.js";
import { parseFormats } from "./size-estimate.js";

const NO_LIMITS = { maxFileSizeBytes: null, quotaBytes: null };

const EXACT = parseFormats({
  formats: [
    { height: 1080, vcodec: "avc1", acodec: "none", filesize: 900 },
    { vcodec: "none", acodec: "mp4a", filesize: 100 },
  ],
});

const APPROX = parseFormats({
  formats: [
    { height: 1080, vcodec: "avc1", acodec: "none", filesize_approx: 900 },
    { vcodec: "none", acodec: "mp4a", filesize_approx: 100 },
  ],
});

const anyVideo = { audioOnly: false, maxHeight: null, maxFps: null };

test("no limits lets everything through", () => {
  const v = checkBeforeDownload({
    permissions: NO_LIMITS,
    formats: EXACT,
    selection: anyVideo,
    usedBytes: 10_000,
  });
  assert.equal(v.kind, "ok");
});

test("a measured size over the limit is refused outright", () => {
  const v = checkBeforeDownload({
    permissions: { maxFileSizeBytes: 500, quotaBytes: null },
    formats: EXACT,
    selection: anyVideo,
    usedBytes: 0,
  });
  assert.equal(v.kind, "refused");
  assert.equal(v.kind === "refused" && v.code, "file_too_large");
});

test("an estimated size over the limit only warns", () => {
  // The whole point: refusing on a guess would block downloads that fit, and
  // offering "go ahead" on a certainty would be a trap.
  const v = checkBeforeDownload({
    permissions: { maxFileSizeBytes: 500, quotaBytes: null },
    formats: APPROX,
    selection: anyVideo,
    usedBytes: 0,
  });
  assert.equal(v.kind, "warn");
});

test("a full quota is refused however uncertain the size is", () => {
  const v = checkBeforeDownload({
    permissions: { maxFileSizeBytes: null, quotaBytes: 1000 },
    formats: APPROX,
    selection: anyVideo,
    usedBytes: 1000,
  });
  assert.equal(v.kind, "refused");
  assert.equal(v.kind === "refused" && v.code, "quota_exceeded");
});

test("a quota counts what is already on disk", () => {
  const v = checkBeforeDownload({
    permissions: { maxFileSizeBytes: null, quotaBytes: 1500 },
    formats: EXACT,
    selection: anyVideo,
    usedBytes: 800, // 800 + 1000 > 1500
  });
  assert.equal(v.kind, "refused");
});

test("while running, the announced total counts as much as the written bytes", () => {
  const permissions = { maxFileSizeBytes: 1000, quotaBytes: null };
  // Barely started, but yt-dlp already says where this is going.
  assert.equal(
    checkWhileRunning({
      permissions,
      downloadedBytes: 10,
      totalBytes: 5000,
      usedBytesAtStart: 0,
    }),
    "file_too_large",
  );
  // No total announced: the bytes on disk decide.
  assert.equal(
    checkWhileRunning({
      permissions,
      downloadedBytes: 1200,
      totalBytes: null,
      usedBytesAtStart: 0,
    }),
    "file_too_large",
  );
  assert.equal(
    checkWhileRunning({
      permissions,
      downloadedBytes: 100,
      totalBytes: 800,
      usedBytesAtStart: 0,
    }),
    null,
  );
});

test("while running, a quota counts the folder it is landing in", () => {
  assert.equal(
    checkWhileRunning({
      permissions: { maxFileSizeBytes: null, quotaBytes: 1000 },
      downloadedBytes: 100,
      totalBytes: 300,
      usedBytesAtStart: 800,
    }),
    "quota_exceeded",
  );
});

test("selectionFor reads the caps a preset implies", () => {
  assert.deepEqual(selectionFor("720p"), {
    audioOnly: false,
    maxHeight: 720,
    maxFps: null,
  });
  assert.equal(selectionFor("audio-mp3").audioOnly, true);
  // The retired preset still behaves as it was recorded.
  assert.deepEqual(selectionFor("1080p60"), {
    audioOnly: false,
    maxHeight: 1080,
    maxFps: 60,
  });
  assert.equal(
    selectionFor("best", { maxHeight: 480, maxFps: null }).maxHeight,
    480,
  );
});
