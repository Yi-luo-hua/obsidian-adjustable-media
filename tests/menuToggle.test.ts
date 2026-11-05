import assert from "node:assert/strict";
import { test } from "node:test";
import type { Menu } from "obsidian";
import { menuToggle } from "../src/view/menuToggle.ts";

test("a second press closes a menu even when the host hides it before the click", () => {
  for (const hostHidesFirst of [false, true]) {
    let press = () => {}, hidden = () => {}, opened = 0;
    const trigger = { addEventListener(_name: string, callback: () => void) { press = callback; } };
    const menu = { hide() { hidden(); }, onHide(callback: () => void) { hidden = callback; } };
    const toggle = menuToggle(trigger as unknown as HTMLElement);
    const open = () => { opened++; return menu as unknown as Menu; };
    press(); toggle(open);
    assert.equal(opened, 1);
    press();
    if (hostHidesFirst) menu.hide();
    toggle(open);
    assert.equal(opened, 1, "the second click must not reopen the menu");
    press(); toggle(open);
    assert.equal(opened, 2);
    menu.hide(); // Outside click, Escape or a menu action.
    press(); toggle(open);
    assert.equal(opened, 3, "outside dismissal must allow the next click to open");
  }
});
