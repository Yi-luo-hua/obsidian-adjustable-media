import assert from "node:assert/strict";
import { test } from "node:test";
import { videoPreviewUrl } from "../src/view/videoSource.ts";

test("first-frame preview retains the local resource path and cache query", () => {
  const resource = "capacitor://localhost/_capacitor_file_/vault/clip%20one.mp4?1791302016559";
  const preview = new URL(videoPreviewUrl(resource));
  const original = new URL(resource);
  assert.equal(preview.protocol, original.protocol);
  assert.equal(preview.host, original.host);
  assert.equal(preview.pathname, original.pathname);
  assert.equal(preview.search, original.search);
  assert.equal(preview.hash, "#t=0.001");
});

test("preview preserves a user's remote playback interval and other fragments", () => {
  for (const fragment of ["#t=12,20", "#t=0.001", "#track=chapter2"]) {
    const resource = `https://example.com/clip.mp4?signature=a%2Bb${fragment}`;
    assert.equal(videoPreviewUrl(resource), resource);
  }
});
