/* eslint obsidianmd/hardcoded-config-path: "off" -- This Node tool creates a new dedicated vault with the default configuration folder. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { tablet: { type: "boolean", default: false } } });
const deviceType = values.tablet ? "tablet" : "phone";
const vaultName = values.tablet ? "adjustable-media-tablet-test" : "adjustable-media-mobile-test";
const output = path.join("dist", vaultName);
const plugin = path.join(output, ".obsidian/plugins/adjustable-media");
const helper = path.join(output, ".obsidian/plugins/mobile-acceptance");
await Promise.all([mkdir(plugin, { recursive: true }), mkdir(helper, { recursive: true }), mkdir(path.join(output, "attachments"), { recursive: true })]);
for (const name of ["main.js", "styles.css"]) await copyFile(name, path.join(plugin, name));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
await writeFile(path.join(plugin, "manifest.json"), JSON.stringify({ ...manifest, isDesktopOnly: false }, null, 2));
await writeFile(path.join(plugin, "data.json"), JSON.stringify({ autoConvert: false, keepLayoutHighlight: true, guideRevision: 1 }));
await copyFile("scripts/mobile-acceptance-plugin.js.txt", path.join(helper, "main.js"));
await writeFile(path.join(helper, "manifest.json"), JSON.stringify({ id: "mobile-acceptance", name: "Mobile acceptance", version: "1.0.0", minAppVersion: "1.8.7", author: "Local", description: "Dedicated test vault observations", isDesktopOnly: false }));
await writeFile(path.join(output, ".obsidian/community-plugins.json"), JSON.stringify(["adjustable-media", "mobile-acceptance"]));
await writeFile(path.join(output, ".obsidian/app.json"), JSON.stringify({ defaultViewMode: "preview", readableLineLength: false }));
await writeFile(path.join(output, ".obsidian/mobile-toolbar.json"), JSON.stringify({ visible: true, items: ["mobile-acceptance:capture-state", "mobile-acceptance:export-report", "editor:undo", "editor:redo"] }));
const vault = "E:/TOOLS/vml-test-vault/attachments/";
for (const [source, target] of [["square-1x1.png", "square.png"], ["landscape-16x9.png", "landscape.png"], ["LoopVid_00001_p84_pccpp_1771066925.mp4", "clip.mp4"]]) await copyFile(vault + source, path.join(output, "attachments", target));
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
const instructions = `# 真机验收步骤\n\n这是独立测试库，候选插件尚未声明正式手机支持。先开启第三方插件，并确认 Adjustable Media 和 Mobile acceptance 都已启用。\n\n每次操作后用命令面板运行“记录当前真机状态”；底栏也配置了记录和导出按钮。\n\n1. 打开“01 显示与媒体”，分别用阅读和实时预览；确认两张图片、视频与公式显示。点视频播放，再横竖屏各记录一次。\n2. 打开“02 长浮动”，手指快速滚动到中段再回顶部，确认正文未跳开、浮动仍在，两个模式分别记录。\n3. 打开“03 文字输入”的实时预览，点左文字栏，在末尾用手机中文输入法输入“手机中文测试”；观察组字、收起键盘、保存，离开笔记再重开。用撤销恢复，再重做。若没有完成/取消入口或键盘遮住操作，记录为失败，不绕过。\n4. 设置里关闭“保持布局块边框高亮”，点击块内与块外；再打开，确认边框恢复。\n5. 普通手指滚动经过图片，确认没有误拖；尝试长按菜单和拖动取消，若没有入口或发生意外保存，记录具体步骤。此项用于决定手机交互方案。\n6. 切到手机桌面再返回、旋转、返回上一笔记，然后记录。\n7. 运行“导出真机报告”，把生成的 JSON 文件和测试失败的截图交回电脑。两台手机分别生成报告。请同时提供手机系统版本。\n\n“01”和“02”只看不编辑；“03”允许测试输入，报告不把它的主动变化计作意外改写。界面截图和手指/输入法操作需人工确认；报告自动记录视口、布局尺寸、资源、事件与只读笔记守恒。\n`;
const tabletInstructions = '\n## 平板附加矩阵\n\n先横屏全屏，再竖屏全屏；每次记录真实视口。使用系统分屏将 Obsidian 调整到一半和较窄宽度，再回到全屏，记录图片、视频、四栏文字、宽表格和长浮动。打开同一笔记的两个 Obsidian 窗格，分别切换阅读和实时预览，确认宽度、光标高亮与输入不串窗格。系统分屏、软键盘和原生中文候选必须实际操作，不能用桌面模拟替代。\n\n在“05 窄屏与宽表格”中，表格和代码允许在自己的区域横向滚动，整篇笔记不应被撑宽；所有列和代码原文仍需完整。使用“03 文字输入”核验“完成”及“放弃草稿”按钮，后者只放弃未保存的无效草稿，已写入的输入通过原生撤销恢复。\n';
await writeFile(path.join(output, "00 从这里开始.md"), instructions + (values.tablet ? tabletInstructions : ""));
for (const [name, text] of Object.entries(notes)) await writeFile(path.join(output, name), text);
const hashes = {};
for (const name of ["main.js", "styles.css"]) hashes[name] = createHash("sha256").update(await readFile(name)).digest("hex");
await writeFile(path.join(output, "build-info.json"), JSON.stringify({ at: new Date().toISOString(), vaultName, deviceType, hashes, officialDesktopOnly: manifest.isDesktopOnly, candidateDesktopOnly: false, originals: { "01 显示与媒体.md": notes["01 显示与媒体.md"], "02 长浮动.md": notes["02 长浮动.md"], "05 窄屏与宽表格.md": notes["05 窄屏与宽表格.md"] } }, null, 2));
process.stdout.write(output + "\n");
