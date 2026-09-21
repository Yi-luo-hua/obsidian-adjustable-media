import test from "node:test";
import assert from "node:assert/strict";

import { printPlan } from "../src/markdown/print.ts";

test("export replaces whole drawable layouts and preserves code and surrounding Markdown", () => {
  const code = ['```html', '<!-- vml -->', '![[example.png]]', '<!-- /vml -->', '```'].join('\n');
  const text = ['# Heading', code, '', '<!-- vml {"v":2,"wrap":"right","skip":3} -->', '![[figure.png|240]]', '<!-- /vml -->',
    'Paragraph.', '', '<!-- vml -->', 'Left text.', '![[other.png]]', 'Right text.', '<!-- /vml -->', 'Tail'].join('\n');
  const plan = printPlan(text, 'export');
  assert.equal(plan.blocks.length, 2);
  assert.ok(plan.markdown.includes(code));
  assert.match(plan.markdown, /data-vml-print="export-0"/);
  assert.match(plan.markdown, /data-vml-print="export-1"/);
  assert.ok(plan.markdown.endsWith('\nTail'));
  assert.equal(plan.blocks[1]?.leftText?.lines.join('\n'), 'Left text.');
  assert.ok(text.includes('![[figure.png|240]]'));
});

test("export leaves ordinary notes and incomplete layouts alone", () => {
  const text = '# Heading\n\n<!-- vml -->\n```python\nprint(1)\n<!-- /vml -->';
  assert.deepEqual(printPlan(text, 'export'), { markdown: text, blocks: [] });
});
