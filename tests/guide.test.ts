import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { findV2Blocks, isDrawable } from "../src/format/v2.ts";
import { GUIDE_REVISION, readGuideRevision, shouldShowGuide } from "../src/guide/state.ts";
import { collectRefs } from "../src/markdown/crossref.ts";

test("the guide opens for new and pre-guide installs, but not again on ordinary updates", () => {
  for (const value of [undefined, null, "1", -1, NaN, 0.5]) {
    assert.equal(shouldShowGuide(readGuideRevision(value)), true);
  }
  assert.equal(shouldShowGuide(readGuideRevision(GUIDE_REVISION)), false);
  assert.equal(shouldShowGuide(readGuideRevision(GUIDE_REVISION + 1)), false);
});

for (const language of ["zh-CN", "en"]) {
  test(`${language} examples have valid layouts, packaged media and resolvable references`, () => {
    const text = readFileSync(new URL(`../docs/examples/Guide.${language}.md`, import.meta.url), "utf8");
    const blocks = findV2Blocks(text.split("\n"));
    assert.equal(blocks.length, 5);
    assert.ok(blocks.every((block) => isDrawable(block) && block.metaError === null));
    for (const block of blocks) {
      for (const embed of block.rows.flatMap((row) => row.embeds)) {
        const data = readFileSync(new URL(`../docs/examples/${embed.target}`, import.meta.url));
        assert.ok(data.byteLength > 0);
      }
    }
    const refs = collectRefs(text.split("\n"));
    for (const key of ["fig:eval", "fig:gpt2", "eq:attn", "tbl:arch"]) assert.ok(refs.targets.has(key), key);
    assert.equal(refs.targets.size, 4);
  });
}
