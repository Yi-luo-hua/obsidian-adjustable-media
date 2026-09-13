# 开发指南

本仓库是 Obsidian 插件 Adjustable Media（插件 id `adjustable-media`）。存储格式、代码结构、写入规则和实测过的 Obsidian 行为见 [docs/DESIGN.md](docs/DESIGN.md)，动手前先读。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm ci` | 安装依赖 |
| `npm run check` | 类型检查 + lint + 测试，每次改动后都必须通过 |
| `npm run lint` | 用官方插件审核的规则（`eslint-plugin-obsidianmd`）检查代码 |
| `npm run dev` | 监听源码，生成带 sourcemap 的开发版 `main.js` |
| `npm run build` | 类型检查 + 生产构建（压缩、无 sourcemap） |
| `npm run release` | 生产构建，并在 `dist/adjustable-media/` 生成发布文件；会检查三处版本号是否一致 |

- Node 24，与 CI 一致。
- `main.js` 是构建产物，不入库，只通过 GitHub Releases 分发。发布流程见 [docs/RELEASE.md](docs/RELEASE.md)。

## 改写笔记的原则（优先级最高）

1. 永远不改写媒体嵌入文本本身，只改注释里的设置，或者把嵌入整段原样搬运。
2. 只替换目标块自身的行范围，不做任何全文规范化（空行、换行符、缩进都不碰）。
3. 写入前校验目标内容与预期完全一致；不一致就放弃写入并提示，绝不猜测位置写入。读不懂设置的块（`isEditable` 为 false）只显示、不写入。
4. 只处理 `scanMarkdownLines` 判定为 `text` 的行；围栏代码、frontmatter、公式、注释里的内容一律不碰。
5. 渲染过程中从不写文件。所有写入都经过 `src/layout/writeBack.ts`。

## 代码约定

- 需要单元测试的逻辑写成纯模块，满足下面三条，`node --test` 才能直接运行它：
  - 不以值的方式导入 `obsidian`（`import type` 可以）。
  - 相对导入写 `.ts` 扩展名。
  - 只用可擦除的 TypeScript 语法：不用 `enum`、`namespace`、构造函数参数属性。
- 操作编辑器文本的代码依赖 `src/editor/editorLike.ts` 里的 `EditorLike`；测试时用 `tests/support/memoryEditor.ts` 代替真实编辑器。
- 测试文件放 `tests/*.test.ts`，使用 `node:test`；测试辅助代码放 `tests/support/`。
- 界面文字放 `src/view/messages.ts`，同时写中文和英文，用句首大写（sentence case）。
- 遵守官方插件审核要求：不用 `innerHTML`；样式通过 CSS 类和 CSS 变量（`setCssProps`）设置，不直接写 `element.style`；用 `vault.process` 或编辑器 API 改笔记，不用 `vault.modify`；不设默认快捷键；命令名和命令 id 里不带插件名。
- 外部依赖越少越好，优先使用 Obsidian 官方 API 和原生 DOM 事件。
- Obsidian API 的行为不确定时，写明不确定在哪里，选择保守的实现，并在测试库里实测。

## 测试库

- 只在专门的测试库里调试插件，不要加载到真实笔记库。
- 用目录链接把仓库挂进测试库（在 PowerShell 中执行，路径按实际情况替换）：

  ```powershell
  New-Item -ItemType Junction -Path "<测试库>\.obsidian\plugins\adjustable-media" -Target "E:\TOOLS\obsidian-adjustable-media"
  ```

- 测试库在 Obsidian 里打开时，可以用 Obsidian 命令行驱动，不必手动点界面（测试库名为 `vml-test-vault`）：
  - `obsidian vault=vml-test-vault plugin:reload id=adjustable-media`：重新加载插件；
  - `obsidian vault=vml-test-vault dev:errors`：查看加载错误；
  - `obsidian vault=vml-test-vault eval "code=..."`：在应用里执行 JS（这里不能 `require('obsidian')`，JS 里只用单引号）。`code=` 里只放一行短代码，多行脚本先存成文件，再用 `code=eval(require('fs').readFileSync('<路径>','utf8'))` 执行：把多行脚本直接当参数传入时，命令行桥接生成的 JSON 无效，Obsidian 主进程抛出未捕获的异常并弹出模态错误框，关掉它之前命令行一直没有响应；
  - `obsidian vault=vml-test-vault dev:screenshot "path=..."`：截图。窗口在后台时截图会落后一帧，连截两次，取第二张。
- 测试库窗口被其他窗口完全挡住时，页面处于 hidden 状态，`requestAnimationFrame` 不再触发，CodeMirror 也就不测量、不重排，实测数据全都不可信。先执行一次 `obsidian vault=vml-test-vault eval "code=require('@electron/remote').getCurrentWebContents().setBackgroundThrottling(false)"`，重启 Obsidian 前一直有效。
- 会改动测试笔记的实测，先把笔记备份，测完恢复并用哈希值核对。

## Git

- 较大的改动在单独的分支上开发，验收后再合并到 `main`。
- 发布用版本号本身作为标签（例如 `0.1.0`），不带 `v`。
