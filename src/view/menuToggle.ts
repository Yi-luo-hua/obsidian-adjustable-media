import type { Menu } from "obsidian";

/** Remember the open state before the host dismisses menus on the outside mouse press. */
export function menuToggle(trigger: HTMLElement): (open: () => Menu | null) => void {
  let menu: Menu | null = null;
  let closing = false;
  trigger.addEventListener("pointerdown", () => { closing = menu !== null; }, { capture: true });
  return open => {
    if (menu) { menu.hide(); closing = false; return; }
    if (closing) { closing = false; return; }
    const next = open();
    menu = next;
    next?.onHide(() => { if (menu === next) menu = null; });
  };
}
