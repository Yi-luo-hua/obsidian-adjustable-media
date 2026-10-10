import assert from "node:assert/strict";
import { test } from "node:test";
import * as format from "../src/format/v2.ts";
import * as model from "../src/layout/model.ts";
import * as projection from "../src/layout/viewProjection.ts";
import * as columns from "../src/markdown/textColumns.ts";
import { mockedModule } from "./support/mockedModule.ts";

class Element {
  win = { Event };
  dispatchEvent(_event: Event): boolean { return true; }
  children: Element[] = [];
  classes = new Set<string>();
  props: Record<string, string> = {};
  attrs: Record<string, string> = {};
  createDiv(options: { cls?: string; attr?: Record<string, string> } = {}): Element {
    const child = new Element();
    child.addClass(...(options.cls ?? "").split(" "));
    child.attrs = options.attr ?? {};
    this.children.push(child);
    return child;
  }
  addClass(...names: string[]): void { names.forEach(name => this.classes.add(name)); }
  toggleClass(name: string, enabled: boolean): void { if (enabled) this.classes.add(name); else this.classes.delete(name); }
  setCssProps(props: Record<string, string>): void { Object.assign(this.props, props); }
  querySelectorAll(): Element[] { return []; }
}

test("all views render exact manual segments separately and wait for every column", async () => {
  const rendered: Array<{ text: string; element: Element }> = [];
  const finish: Array<() => void> = [];
  const module = await mockedModule<{ renderLayout(el: unknown, options: unknown): Element; layoutRenderState(el: Element): string }>(new URL("../src/view/layoutView.ts", import.meta.url), {
    obsidian: { MarkdownRenderer: { render: (_app: unknown, text: string, element: Element) => { rendered.push({ text, element }); return new Promise<void>(resolve => finish.push(resolve)); } } },
    "../format/v2.ts": format, "../layout/model.ts": model, "../layout/viewProjection.ts": projection, "../markdown/textColumns.ts": columns,
    "./crossrefView.ts": { numbered: (text: string) => text, markCaptions() {} }, "./media.ts": {}, "./mediaControls.ts": {}, "./messages.ts": { t: (key: string) => key },
  });
  const lines = ['<!-- vml {"v":2,"type":"text","cols":4,"gap":1} -->', 'First', '', '+++', '', 'Second ![[a.png|120]]', '<!-- /vml -->'];
  const original = lines.join("\n");
  const tasks: Promise<void>[] = [];
  const root = module.renderLayout(new Element(), { app: {}, sourcePath: "note.md", model: model.modelFromBlock(format.findV2Blocks(lines)[0]), editable: false, warning: null, component: {}, renderTasks: tasks });
  assert.deepEqual(rendered.map(item => item.text), ["First\n\n", "\nSecond ![[a.png|120]]"]);
  assert.equal(root.props["--vml-cols"], "2");
  assert.equal(root.props["--vml-gap"], "1em");
  assert.equal(rendered[1]?.element.attrs["data-source-from"], "11");
  assert.equal(tasks.length, 2);
  finish[0]();
  await Promise.resolve();
  assert.equal(module.layoutRenderState(root), "pending");
  finish[1]();
  await Promise.all(tasks);
  await Promise.resolve();
  assert.equal(module.layoutRenderState(root), "rendered");
  assert.equal(lines.join("\n"), original);
});
