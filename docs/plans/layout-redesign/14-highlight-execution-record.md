# W08 保持布局块边框高亮实施与验收

日期：2026-10-08。状态：本地实现与验收通过，未合并、未发布。分支 `codex/cursor-border-highlight`，源码起点 `d2287f7`；工作区原有规划修改保留。

## 行为

设置名为“保持布局块边框高亮”，默认开启。保存字段 `keepLayoutHighlight` 缺失或类型无效时取 true，旧用户保留常驻边框。关闭时：

- 每个窗格按编辑光标 head 和运行期块 ID 判断归属；覆盖块的选区本身不激活边框，多光标可以激活不同块。
- 源码照原规则展开，实际源码范围显示不占空间的左侧提示线；保留预览和浮动替身使用相同的块身份。
- 文字栏的焦点属于该块；组字时切换设置不重建编辑器，切窗格、切笔记、结束编辑后清除旧状态。
- 普通边框保持原来的透明边框占位，hover 仍提供手柄；错误框和落点反馈保留各自样式。设置不写笔记。

实现位于 `settings.ts`、`messages.ts`、`livePreview.ts`、`cursorHighlight.ts` 和 CSS。设置保存通知现有窗格，不用整窗格重载实现即时生效。

## 当前构建与环境

- Windows，Node 24.11.1，测试库 `vml-test-vault`，运行的 Obsidian **1.14.4**。
- 安装壳的 `remote.app.getVersion()` 返回 1.13.7；它不是本次运行的宿主版本。宿主版本以测试库窗口和设置窗口标题核对，JSON 将壳版本另存为 `installerVersion`。
- 最终生产 `main.js` SHA-256：`bcf4e0b18746f42e0d9132f0a55e9a8c45e5be5000035d3f12071f7acf86a703`。
- CSS SHA-256：`b61a21139af51eefc28792ac9ae76d8896a73f9d22cd331b545d6c5d5b738e80`。
- `npm run check`：375 项通过，类型检查及 lint 通过；生产构建通过。

## 验收证据

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 默认值、关闭／开启、持久化／重载 | 缺失设置默认开启；两种值保存正确，关闭后重载继续生效。 | `w08-highlight.js.txt/json`、`settings.test.ts` |
| 源码光标、选区／多光标、重复块 | 开始／结束注释包含在范围内；只用 head，未串到重复块。真实按钮点击、方向键通过。 | `w08-highlight.json`、`layoutHighlightState.test.ts`、`cursorHighlight.test.ts` |
| 文字栏与中文组字 | 真实点击及 IME 组字／提交通过；切换设置时保留同一编辑器 DOM。 | `w08-highlight.json`、`w08-column.png` |
| 多窗格、切笔记、结束编辑 | 原窗格清除焦点高亮，新窗格独立判断；源码展开的只读预览同步高亮。 | `w08-highlight.json`、`w08-source.png` |
| 替身／真块交接 | 替身保留相同 ID，替身文字栏可激活高亮，离开后隐藏。 | `w08-proxy-hidden.png`、`w08-proxy-active.png` |
| 几何、hover、手柄、落点反馈 | 四个布局开关前后 x/y/宽/高差不超过 0.01px；hover 不激活普通边框，手柄仍可用，落点反馈未被覆盖。 | `w08-highlight.json`，24 个观测状态全部通过 |
| 原生设置页 | 中文名称和说明正确，实际开关默认开启；截图来自测试库的独立设置窗口。 | `w08-settings-ui.json/png` |
| 阅读与原生 PDF | 阅读矩形／边框相同；开关两种状态均经 Obsidian 原生流程导出，打印 DOM 没有编辑框类，内容相同。两份 PDF 的 3 页以 Poppler 110dpi 栅格化，每页 PNG 哈希相同；已逐页检查。 | `w08-pdf.js.txt/json`、`w08-pdf-raster-comparison.json`；QA 文件在 `dist/w08-pdf/` |

所有测试使用临时笔记，结束后移入回收站。原笔记、快捷键文件、插件设置及 PDF 配置恢复并核对哈希。`dev:errors` 无捕获错误。手机平台仍按 W09–W11 验收，本项不改变正式桌面限定。
