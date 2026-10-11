/* eslint obsidianmd/hardcoded-config-path: "off" -- This Node tool creates a new dedicated vault with the default configuration folder. */
import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const { values } = parseArgs({ options: {
  platform: { type: "string", default: "android" },
  tablet: { type: "boolean", default: false },
  assets: { type: "string" },
  diagnostics: { type: "boolean", default: false },
} });
if (!["android", "ios"].includes(values.platform) || !values.assets) {
  throw new Error("Usage: node scripts/prepare-mobile-test.mjs --assets <folder> [--platform android|ios] [--tablet] [--diagnostics]");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const deviceType = values.tablet ? "tablet" : "phone";
const vaultName = values.platform === "ios"
  ? (values.tablet ? "adjustable-media-ipad-test" : "adjustable-media-iphone-test")
  : (values.tablet ? "adjustable-media-tablet-test" : "adjustable-media-mobile-test");
const output = path.join(root, "dist", vaultName);
const plugin = path.join(output, ".obsidian/plugins/adjustable-media");
const helper = path.join(output, ".obsidian/plugins/mobile-acceptance");
await Promise.all([mkdir(plugin, { recursive: true }), mkdir(helper, { recursive: true }), mkdir(path.join(output, "attachments"), { recursive: true })]);
for (const name of ["main.js", "styles.css"]) await copyFile(path.join(root, name), path.join(plugin, name));
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
await writeFile(path.join(plugin, "manifest.json"), JSON.stringify({ ...manifest, isDesktopOnly: false }, null, 2));
await writeFile(path.join(plugin, "data.json"), JSON.stringify({ autoConvert: false, keepLayoutHighlight: true, guideRevision: 1 }));
await copyFile(path.join(root, "scripts/mobile-acceptance-plugin.js.txt"), path.join(helper, "main.js"));
await writeFile(path.join(helper, "manifest.json"), JSON.stringify({ id: "mobile-acceptance", name: "Mobile acceptance", version: "1.0.0", minAppVersion: "1.8.7", author: "Local", description: "Dedicated test vault observations", isDesktopOnly: false }));
await writeFile(path.join(output, ".obsidian/community-plugins.json"), JSON.stringify(
  values.diagnostics ? ["adjustable-media", "mobile-acceptance"] : ["adjustable-media"],
));
await writeFile(path.join(output, ".obsidian/app.json"), JSON.stringify({ defaultViewMode: "preview", readableLineLength: false }));
await writeFile(path.join(output, ".obsidian/mobile-toolbar.json"), JSON.stringify({ visible: true, items: ["mobile-acceptance:capture-state", "mobile-acceptance:export-report", "editor:undo", "editor:redo"] }));
for (const name of ["square.png", "landscape.png", "clip.mp4"]) {
  await copyFile(path.join(values.assets, name), path.join(output, "attachments", name));
}
const notes = {
  "01 显示与媒体.md": '# 显示与媒体\n\n<!-- vml {"v":2,"rows":[{"height":180,"widths":[1,1.4]}]} -->\n![[attachments/square.png]] ![[attachments/landscape.png]]\n<!-- /vml -->\n\n<!-- vml {"v":2,"rows":[{"height":200}]} -->\n![[attachments/clip.mp4]]\n<!-- /vml -->\n\n<!-- vml {"v":2,"type":"text","cols":2} -->\n手机端分栏文字。中文与 English text 应完整显示。\n\n$$\nx^2+y^2=z^2\n$$\n\n第二段文字包含 **粗体** 和列表。\n- 第一项\n- 第二项\n\n<!-- /vml -->\n',
  "02 长浮动.md": '<!-- vml {"v":2,"type":"text","wrap":"right","width":0.4} -->\n' + Array.from({ length: 160 }, (_, i) => `旁注 ${i}  \n`).join("") + '<!-- /vml -->\n' + Array.from({ length: 200 }, (_, i) => `正文 ${i}：滚动到中段，再回到顶部，文字与浮动应连续。\n\n`).join(""),
  "03 文字输入.md": '# 文字输入\n\n<!-- vml {"v":2,"width":0.4} -->\n只在这栏末尾输入“手机中文测试”。\n![[attachments/square.png]]\n右栏原文应保留。\n<!-- /vml -->\n\n块外原文应保留。\n',
  "05 窄屏与宽表格.md": '# 窄屏与宽表格\n\n<!-- vml {"v":2,"type":"text"} -->\n'
    + '| ' + Array.from({ length: 12 }, (_, i) => `栏目 ${i + 1}`).join(' | ') + ' |\n'
    + '| ' + Array.from({ length: 12 }, () => '---').join(' | ') + ' |\n'
    + '| ' + Array.from({ length: 12 }, (_, i) => `中文内容 ${i + 1} abcdefghijklmnop`).join(' | ') + ' |\n\n'
    + '```text\n' + 'Long code line '.repeat(24) + '\n```\n<!-- /vml -->\n\n'
    + '<!-- vml {"v":2,"type":"text","cols":4} -->\n'
    + Array.from({ length: 8 }, (_, i) => `段落 ${i + 1}：中文和 English words 在四栏中完整保留。\n\n`).join('')
    + '<!-- /vml -->\n\n块外正文完整保留。\n',
};
const fixtures = path.join(root, "scripts/mobile-test-notes");
for (const name of await readdir(fixtures)) {
  if (name.endsWith(".md")) notes[name] = await readFile(path.join(fixtures, name), "utf8");
}
for (const [name, text] of Object.entries(notes)) await writeFile(path.join(output, name), text);
const hashes = {};
for (const name of ["main.js", "styles.css"]) hashes[name] = createHash("sha256").update(await readFile(path.join(root, name))).digest("hex");
await writeFile(path.join(output, "build-info.json"), JSON.stringify({ at: new Date().toISOString(), vaultName, platform: values.platform, deviceType, diagnostics: values.diagnostics, hashes, officialDesktopOnly: manifest.isDesktopOnly, candidateDesktopOnly: false, originals: { "01 显示与媒体.md": notes["01 显示与媒体.md"], "02 长浮动.md": notes["02 长浮动.md"], "05 窄屏与宽表格.md": notes["05 窄屏与宽表格.md"] } }, null, 2));
process.stdout.write(output + "\n");
