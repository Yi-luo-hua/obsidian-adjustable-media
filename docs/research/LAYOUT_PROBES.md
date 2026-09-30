# 布局研究基线探针

状态：2026-09-30 的基线复现，不是修复后的预期行为。使用 Node 24，在项目根目录执行。无笔记或源码写入。

实施后说明：P1 已修复未知格式解包与实际阅读依赖失效入口，以下旧基线探针的断言不再适用于当前分支，须保留为历史复现。当前正确行为由 `tests/layoutDependencies.test.ts`、[首批宿主记录](../plans/layout-redesign/07-execution-record.md) 和 [每窗格基础记录](../plans/layout-redesign/08-pane-foundation-record.md) 验证；后续顺序见 [09 进度安排](../plans/layout-redesign/09-progress-and-next-steps.md)。

以下脚本使用仓库相对导入，移出原研究目录后仍可运行。以 Markdown 保存可避免把一次性研究脚本加入插件源码与脚本 lint 范围。

~~~powershell
$probeText = Get-Content docs/research/LAYOUT_PROBES.md -Raw
$probeCode = [regex]::Match($probeText, '(?s)~~~javascript\r?\n(.*?)\r?\n~~~').Groups[1].Value
$probeCode | node --input-type=module
~~~

预期输出说明当前的三块排序、失效漏报、邻块偏移丢失、上限拒绝与格式行为。相关实现修复后断言应失败；将场景转写为验证正确语义的正式测试，不保留错误行为。

~~~javascript
// Characterizes the current implementation for the design study; no note or source writes.
import assert from 'node:assert/strict';
import { findV2Blocks } from './src/format/v2.ts';
import { effectiveWrapSkip, visualWrapSkip } from './src/layout/floatOrder.ts';
import { planPlacement } from './src/layout/placement.ts';
import { applyEditsToText } from './src/layout/edits.ts';
import { drawnFrom, isStale } from './src/layout/drawn.ts';
const float = (name, side, skip) => [`<!-- vml ${JSON.stringify({v:2,wrap:side,...(skip?{skip}:{})})} -->`,`![[${name}.png]]`,'<!-- /vml -->'];
const initial=[...float('A','left',2),'',...float('B','right',4),'',...float('C','left',6),'body'];
const moved=applyEditsToText(initial.join('\n'),planPlacement(initial,findV2Blocks(initial)[2],{line:8,wrap:'left',skip:1}));
assert.equal(moved.ok,true);
const movedLines=moved.text.split('\n');const movedBlocks=findV2Blocks(movedLines);
const order=movedBlocks.map(b=>b.lines[1]);
assert.deepEqual(order,['![[A.png]]','![[C.png]]','![[B.png]]']);
assert.deepEqual(movedBlocks.map((_,i)=>visualWrapSkip(movedLines,movedBlocks,i)),[2,1,5]);
const same=[...float('A','left',2),'',...float('B','right',4),'body'];const separated=[...same];separated[3]='intervening paragraph';
assert.equal(effectiveWrapSkip(same,findV2Blocks(same),1),2);
assert.equal(effectiveWrapSkip(separated,findV2Blocks(separated),1),4);
assert.equal(isStale(drawnFrom(findV2Blocks(same)),drawnFrom(findV2Blocks(separated))),false);
const pair=[...float('A','left',4),'',...float('B','right',0),'body','','new paragraph'];
const removal=applyEditsToText(pair.join('\n'),planPlacement(pair,findV2Blocks(pair)[0],{line:10,wrap:'left',skip:0}));
assert.equal(removal.ok,true);const after=removal.text.split('\n');
assert.equal(visualWrapSkip(pair,findV2Blocks(pair),1),4);assert.equal(visualWrapSkip(after,findV2Blocks(after),0),0);
const max=[...float('A','left',40),'',...float('B','right',0),'body'];
assert.equal(planPlacement(max,findV2Blocks(max)[1],{line:4,wrap:'right',skip:2}),null);
const downward = applyEditsToText(initial.join('\n'), planPlacement(initial, findV2Blocks(initial)[0], { line: 4, wrap: 'left', skip: 8 }));
assert.equal(downward.ok, true);
const downwardLines = downward.text.split('\n');
const downwardBlocks = findV2Blocks(downwardLines);
assert.deepEqual(downwardBlocks.map(block => block.lines[1]), ['![[B.png]]', '![[A.png]]', '![[C.png]]']);
assert.deepEqual(downwardBlocks.map((_, index) => visualWrapSkip(downwardLines, downwardBlocks, index)), [5, 8, 6]);
const sideChanged = applyEditsToText(pair.join('\n'), planPlacement(pair, findV2Blocks(pair)[0], { line: 0, wrap: 'right', skip: 4 }));
assert.equal(sideChanged.ok, true);
const sideChangedLines = sideChanged.text.split('\n');
assert.equal(visualWrapSkip(sideChangedLines, findV2Blocks(sideChangedLines), 1), 0);
console.log('Confirmed: partial triple reorder, missed relationship invalidation, lost neighbor visual skip, maximum-skip rejected plan.');

// Supplement: compatibility candidates against the current parser.
const { isDrawable } = await import('./src/format/v2.ts');
const { isEditable, planModelEdit, planUnwrap, applyEditsToEditor } = await import('./src/layout/edits.ts');
const { modelFromBlock, setWrap } = await import('./src/layout/model.ts');
const groupMeta = { id: 'block-a', groupId: 'group-1', groupLayout: { columns: [{ id: 'block-a', weight: 1 }] } };
const candidateBlock = version => findV2Blocks([
  '<!-- vml ' + JSON.stringify({ v: version, ...groupMeta }) + ' -->',
  '![[image.png]]',
  '<!-- /vml -->',
])[0];
const extendedV2 = candidateBlock(2);
assert.equal(isDrawable(extendedV2), true);
assert.equal(isEditable(extendedV2), true);
const oldEdit = planModelEdit(extendedV2, setWrap(modelFromBlock(extendedV2), 'left'));
assert.ok(oldEdit);
assert.match(oldEdit.replacement[0], /"groupId":"group-1"/);
const unknownV3 = candidateBlock(3);
assert.equal(isDrawable(unknownV3), true);
assert.equal(isEditable(unknownV3), false);
assert.equal(unknownV3.metaError, 'Unsupported layout format version: 3');
assert.equal(planModelEdit(unknownV3, setWrap(modelFromBlock(unknownV3), 'left')), null);
const nested = findV2Blocks([
  '<!-- vml {"v":3,"kind":"group"} -->',
  '<!-- vml {"v":2} -->',
  '![[image.png]]',
  '<!-- /vml -->',
  '<!-- /vml -->',
]);
assert.equal(nested.length, 1);
assert.equal(nested[0].openLine, 1);
assert.equal(nested[0].closeLine, 3);
assert.equal(isEditable(nested[0]), true);
console.log('Confirmed: V2 extensions remain editable, unknown V3 model edits are blocked, outer wrappers do not protect inner V2.');

// Second review: command routes do not share the model edit guard.
const { blockAt } = await import('./src/commands/plans.ts');
const { MemoryEditor } = await import('./tests/support/memoryEditor.ts');
const v3Source = unknownV3.lines.join('\n');
const commandBlock = blockAt(v3Source.split('\n'), 1);
assert.ok(commandBlock);
assert.equal(isEditable(commandBlock), false);
const commandEditor = new MemoryEditor(v3Source);
assert.equal(applyEditsToEditor(commandEditor, [planUnwrap(commandBlock)]).ok, true);
assert.equal(commandEditor.getValue(), '![[image.png]]');
assert.equal(commandEditor.transactionCount, 1);
const v3Pair = v3Source + '\n\n' + v3Source.replaceAll('block-a', 'block-b').replace('image.png', 'second.png');
const removedComments = applyEditsToText(v3Pair, findV2Blocks(v3Pair.split('\n')).map(planUnwrap));
assert.equal(removedComments.ok, true);
assert.equal(removedComments.text, '![[image.png]]\n\n![[second.png]]');
const { removeItem } = await import('./src/layout/model.ts');
const lastItemRemoved = removeItem(modelFromBlock(extendedV2), { row: 0, index: 0 });
assert.ok(lastItemRemoved);
const removedMember = planModelEdit(extendedV2, lastItemRemoved.model);
assert.ok(removedMember);
assert.deepEqual(removedMember.replacement, []);
console.log('Confirmed: single/batch unwrap still write unknown V3, and a last-media edit can remove V2 extension metadata.');
~~~
