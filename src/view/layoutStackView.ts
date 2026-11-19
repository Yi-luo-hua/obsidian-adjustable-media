import { Menu, type App, type Component } from "obsidian";
import type { EditorView } from "@codemirror/view";

import { MIN_BLOCK_WIDTH } from "../format/v2.ts";
import { planStackDissolve, planStackSizing, planStackSwap, type LayoutStack } from "../layout/layoutStack.ts";
import { modelFromBlock } from "../layout/model.ts";
import { setUpBlockMove } from "./blockDrag.ts";
import type { RefContext } from "./crossrefView.ts";
import { attachInteractions, commitEdits, swallowNextClick } from "./interactions.ts";
import { renderLayout } from "./layoutView.ts";
import { t } from "./messages.ts";
import { trackPointer } from "./pointer.ts";

interface StackViewOptions {
  app: App;
  sourcePath: string;
  component: Component;
  refs?: RefContext;
  renderTasks?: Promise<void>[];
  print?: boolean;
  view?: EditorView;
}

export function renderLayoutStack(container: HTMLElement, stack: LayoutStack, options: StackViewOptions): HTMLElement {
  const { app, sourcePath, component, view } = options;
  const group = container.createDiv({ cls: "vml-stack" });
  group.setCssProps({ "--vml-stack-width": `${stack.width * 100}%`, "--vml-stack-offset": String(stack.offset) });
  const content = group.createDiv({ cls: "vml-stack__members" });
  const writeOptions = { view, readSet: [{ fromLine: stack.openLine, lines: stack.lines }] };
  for (const block of stack.members) {
    const model = modelFromBlock(block);
    const root = renderLayout(content, { ...options, model, editable: view !== undefined, warning: null });
    if (!view) continue;
    const editSource = () => {
      const { doc } = view.state;
      if (doc.line(block.openLine + 1).text !== block.lines[0]) return;
      view.dispatch({ selection: { anchor: doc.line(block.openLine + 2).from }, userEvent: "select" });
      view.focus();
    };
    attachInteractions(root, { app, sourcePath, block, model, ...writeOptions, editSource });
    const button = root.createEl("button", { cls: "vml-edit-source", text: t("editSource") });
    button.addEventListener("click", editSource);
  }
  if (!view) return group;

  group.addClass("vml-stack--interactive");
  const owner = stack.members[0];
  const model = { ...modelFromBlock(owner), width: stack.width, align: null, frameOffset: stack.offset };
  setUpBlockMove(group, { app, sourcePath, block: owner, model, view }, stack);
  const handle = group.createDiv({ cls: "vml-handle vml-frame__handle vml-frame__handle--right",
    attr: { "aria-label": t("resizeStack"), role: "separator" } });
  const direction = stack.offset === 1 ? -1 : 1 / (1 - stack.offset);
  handle.toggleClass("vml-frame__handle--mirrored", direction < 0);
  let cancelResize: (() => void) | undefined;
  component.register(() => cancelResize?.());
  handle.addEventListener("pointerdown", (start) => {
    if (start.button !== 0 || cancelResize) return;
    start.preventDefault();
    start.stopPropagation();
    const available = container.getBoundingClientRect().width;
    if (available <= 0) return;
    let width = stack.width;
    const done = () => {
      cancelResize = undefined;
      handle.removeClass("is-active");
    };
    const restore = () => {
      done();
      group.setCssProps({ "--vml-stack-width": `${stack.width * 100}%` });
    };
    handle.addClass("is-active");
    cancelResize = trackPointer(handle, start, {
      onMove(event) {
        const distance = direction * (event.clientX - start.clientX) / available;
        width = Math.round(Math.max(MIN_BLOCK_WIDTH, Math.min(1, stack.width + distance)) * 1000) / 1000;
        group.setCssProps({ "--vml-stack-width": `${width * 100}%` });
      },
      onEnd() {
        done();
        if (width === stack.width) return;
        swallowNextClick(group.ownerDocument);
        void commitEdits(app, sourcePath, [planStackSizing(stack, width)], writeOptions).then(changed => { if (!changed) restore(); });
      },
      onCancel: restore,
    });
  });
  group.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const menu = new Menu();
    menu.addItem(item => item.setTitle(t("swapStackMembers")).setIcon("arrow-down-up").onClick(() => {
      void commitEdits(app, sourcePath, [planStackSwap(stack)], writeOptions);
    }));
    menu.addItem(item => item.setTitle(t("dissolveStack")).setIcon("ungroup").onClick(() => {
      void commitEdits(app, sourcePath, planStackDissolve(stack), writeOptions);
    }));
    menu.showAtMouseEvent(event);
  });
  return group;
}
