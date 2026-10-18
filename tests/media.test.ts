import assert from "node:assert/strict";
import { test } from "node:test";
import type { App } from "obsidian";
import * as format from "../src/format/v2.ts";
import type { resolveMedia } from "../src/view/media.ts";
import { mockedModule } from "./support/mockedModule.ts";

class TFileStub {}

async function resolver(prefix = "app://test-host/") {
  return mockedModule<{ resolveMedia: typeof resolveMedia }>(new URL("../src/view/media.ts", import.meta.url), {
    obsidian: { Platform: { resourcePathPrefix: prefix }, TFile: TFileStub, normalizePath: (path: string) => path },
    "../format/v2.ts": format,
  });
}

function embed(url: string) {
  return format.readEmbedRow(`![photo](<${url}>)`, 1)![0];
}

test("external file images use the host resource protocol without decoding or rewriting their Markdown", async () => {
  const { resolveMedia } = await resolver();
  const urls = [
    "file:///D:/images/before.jpg",
    "file:///D:/中文 空格/照片.jpg",
    "file:///D:/images/with%20space/%E7%85%A7%E7%89%87.jpg",
    "file:///D:%5Cimages%5Cwith%20space%5Cphoto.jpg",
    "file:///D:/images/100%25%20%23sample.jpg?query=1#fragment",
    "file:///Users/user/Pictures/photo.jpg",
    "file:///home/user/Pictures/photo.jpg",
    "FILE:///D:/images/photo.jpg",
  ];
  for (const url of urls) {
    const item = embed(url);
    const raw = item.raw;
    const media = resolveMedia({} as App, item, "note.md")!;
    assert.equal(media.url, "app://test-host/" + url.slice("file:///".length));
    assert.equal(media.file, null);
    assert.equal(item.target, url);
    assert.equal(item.raw, raw);
  }
});

test("mobile keeps file URLs and other URL schemes retain their complete target", async () => {
  const desktop = await resolver();
  const mobile = await resolver("file:///");
  for (const url of ["https://example.com/a%20b.jpg?q=%25#fragment", "http://example.com/a.jpg", "app://local/D:/a.jpg"]) {
    assert.equal(desktop.resolveMedia({} as App, embed(url), "note.md")!.url, url);
  }
  const url = "file:///storage/emulated/0/中文%20图片.jpg";
  assert.equal(mobile.resolveMedia({} as App, embed(url), "note.md")!.url, url);
});

test("vault links still resolve through the vault and missing links remain unresolved", async () => {
  const { resolveMedia } = await resolver();
  const file = new TFileStub();
  const requests: string[] = [];
  const app = {
    metadataCache: { getFirstLinkpathDest: () => null },
    vault: {
      getAbstractFileByPath(path: string) { requests.push(path); return path === "images/a b.jpg" ? file : null; },
      getResourcePath(value: object) { assert.equal(value, file); return "vault-resource"; },
    },
  } as unknown as App;
  const media = resolveMedia(app, embed("../images/a%20b.jpg"), "notes/note.md")!;
  assert.equal(media.url, "vault-resource");
  assert.equal(media.file, file);
  assert.deepEqual(requests, ["images/a b.jpg"]);
  assert.equal(resolveMedia(app, embed("missing.jpg"), "note.md"), null);
});
