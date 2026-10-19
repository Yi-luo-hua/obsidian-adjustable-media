import assert from "node:assert/strict";
import { test } from "node:test";
import { calloutImages, planCalloutImageWidth } from "../src/layout/calloutImages.ts";
import { applyEditsToText } from "../src/layout/edits.ts";
import { EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";
import { history, undo, redo } from "@codemirror/commands";
import { applyEditsToView } from "../src/layout/editorTransaction.ts";

test("Callout image width only adds settings comments and preserves the quoted embed verbatim", () => {
  for (const embed of ['![[pic.png|alt|320]]', '![alt|320](<pic with spaces.png> "title")', '![image](https://example.com/image.png)']) {
    const text = `before\n\n> [!danger]+ Title\n> text above\n> ${embed}  \n> text below\n\nafter\n`;
    const [source] = calloutImages(text.split("\n"));
    const edit = planCalloutImageWidth(source, source.images[0], 0.4567)!;
    const result = applyEditsToText(text, [edit]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.text, text.replace(`> ${embed}  `,
      `> <!-- vml {"v":2,"scope":"callout-image","rows":[{"width":0.457}]} -->\n> ${embed}  \n> <!-- /vml -->`));
    const [saved] = calloutImages(result.text.split("\n"));
    assert.equal(saved.images[0].width, 0.457);
    assert.equal(saved.images[0].editable, true);
    assert.equal(saved.images[0].embed.raw, embed);
    assert.equal(planCalloutImageWidth(saved, saved.images[0], 0.457), null);
    const second = applyEditsToText(result.text, [planCalloutImageWidth(saved, saved.images[0], 0.6)!]);
    assert.deepEqual(second, { ok: true, text: result.text.replace('"width":0.457', '"width":0.6') });
  }
});

test("nested Callouts, repeated images and inline images retain their source order", () => {
  const text = '> [!note] Outer\n> ![[pic.png]]\n>\n> > [!tip] Inner\n> > ![[pic.png]]\n> > inline ![[pic.png]] text\n> ![[other.png]]\n\n> [!note] Second\n> ![[pic.png]]';
  const sources = calloutImages(text.split("\n"));
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0].images.map(image => [image.line, image.editable]), [[1, true], [4, true], [5, false], [6, true]]);
  const edit = planCalloutImageWidth(sources[0], sources[0].images[1], 0.5)!;
  const result = applyEditsToText(text, [edit]);
  assert.deepEqual(result, { ok: true, text: text.replace('> > ![[pic.png]]',
    '> > <!-- vml {"v":2,"scope":"callout-image","rows":[{"width":0.5}]} -->\n> > ![[pic.png]]\n> > <!-- /vml -->') });
});

test("outer and nested title images retain DOM order without becoming editable", () => {
  const text = '> [!note] ![title](pic.png)\n> ![[pic.png]]\n> > [!tip] ![[pic.png]]\n> > ![[pic.png]]';
  const [source] = calloutImages(text.split("\n"));
  assert.deepEqual(source.images.map(image => [image.line, image.editable]), [[0, false], [1, true], [2, false], [3, true]]);
  assert.equal(planCalloutImageWidth(source, source.images[0], 0.5), null);
  assert.equal(planCalloutImageWidth(source, source.images[2], 0.5), null);
});

test("code, math, comments and frontmatter examples cannot become resizable images", () => {
  const text = '---\nexample: |\n  > [!note]\n  > ![[frontmatter.png]]\n---\n\n```md\n> [!note]\n> ![[code.png]]\n```\n\n> [!note]\n> ```md\n> ![[fence.png]]\n> ```\n> $$\n> ![[math.png]]\n> $$\n> %%\n> ![[comment.png]]\n> %%\n> <!--\n> ![[html.png]]\n> -->\n> `![[inline.png]]`\n> ![[real.png]]';
  assert.deepEqual(calloutImages(text.split("\n")).flatMap(source => source.images.map(image => image.embed.target)), ['real.png']);
});

test("unknown, invalid, ordinary and unfinished quoted layouts stay read-only", () => {
  for (const opener of ['<!-- vml {"v":99} -->', '<!-- vml {broken} -->', '<!-- vml -->', '<!-- vml {"v":2,"scope":"callout-image","rows":[false]} -->']) {
    for (const close of ['\n> <!-- /vml -->', '']) {
      const [source] = calloutImages(`> [!note]\n> ${opener}\n> ![[pic.png]]${close}`.split("\n"));
      assert.equal(source.images[0].editable, false, opener + close);
      assert.equal(planCalloutImageWidth(source, source.images[0], 0.5), null);
    }
  }
});

test("CRLF stays exact and a changed Callout or identical replacement at another location cannot receive the write", () => {
  const text = 'before\r\n\r\n> [!note]\r\n> ![[pic.png]]\r\n> after\r\n\r\nend';
  const lines = text.split("\n");
  const [source] = calloutImages(lines);
  const edit = planCalloutImageWidth(source, source.images[0], 0.4)!;
  const readSet = [{ fromLine: source.from, lines: lines.slice(source.from, source.from + source.lines.length) }];
  const result = applyEditsToText(text, [edit], readSet);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.text.replace(/\r\n/g, "").includes("\n"), false);
  assert.deepEqual(applyEditsToText(text.replace('> after', '> edited'), [edit], readSet), { ok: false, reason: 'stale-dependency' });
  assert.deepEqual(applyEditsToText('new line\r\n' + text, [edit], readSet), { ok: false, reason: 'stale-dependency' });
});

test("nested settings blocks cannot bypass an unknown enclosing block; unknown settings survive a normal resize", () => {
  const own = '<!-- vml {"v":2,"scope":"callout-image","custom":"keep","rows":[{"width":0.4,"custom":17}]} -->';
  const [nested] = calloutImages(`> [!note]\n> <!-- vml {"v":99} -->\n> ${own}\n> ![[pic.png]]\n> <!-- /vml -->\n> ![[other.png]]\n> <!-- /vml -->`.split("\n"));
  assert.deepEqual(nested.images.map(image => image.editable), [false, false]);
  const text = `> [!note]\n> ${own}\n> ![[pic.png]]\n> <!-- /vml -->`;
  const [source] = calloutImages(text.split("\n"));
  assert.deepEqual(applyEditsToText(text, [planCalloutImageWidth(source, source.images[0], 0.6)!]),
    { ok: true, text: text.replace('"width":0.4', '"width":0.6') });
});

test("Callouts already owned by an outer layout are excluded from native Callout rendering", () => {
  const text = '<!-- vml {"v":2,"type":"text"} -->\n> [!note] In a layout\n> ![[inside.png]]\n<!-- /vml -->\n\n> [!note] Native\n> ![[native.png]]';
  assert.deepEqual(calloutImages(text.split("\n")).flatMap(source => source.images.map(image => image.embed.target)), ['native.png']);
});

test("a resize is one isolated undo step and restores all original text", () => {
  const text = '> [!note]\n> ![[pic.png]]\n> after';
  const [source] = calloutImages(text.split("\n"));
  const view = { state: EditorState.create({ doc: text, extensions: history() }),
    dispatch(spec: Transaction | TransactionSpec) { view.state = 'state' in spec ? spec.state : view.state.update(spec).state; } };
  assert.deepEqual(applyEditsToView(view, [planCalloutImageWidth(source, source.images[0], 0.5)!]), { ok: true });
  const saved = view.state.doc.toString();
  assert.notEqual(saved, text);
  assert.equal(undo(view), true);
  assert.equal(view.state.doc.toString(), text);
  assert.equal(redo(view), true);
  assert.equal(view.state.doc.toString(), saved);
});
