# Tab 缩进续行抖动（Issue #27）

交付状态：PR [#33](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/33) 已于 2026-10-20 squash 合入 main（`616ac5b`），Issue #27 随之关闭。公开 0.9.0 的标签与附件早于该修复，未包含本改动；本页验证对应原修复提交 `75bb922`。

## 原因与修改

[Issue #27](https://github.com/Yi-luo-hua/obsidian-adjustable-media/issues/27) 补充了 Tab 缩进触发条件。缩进代码末尾按 Enter 时，Obsidian 会将缩进带到新行。同步 `paragraphBreaks` 原先把这种仅含缩进的尾行当成段落空行，约 80ms 后宿主解析又将其归入代码块，移除 `vml-break`，导致行高从 16px 变成约 24px。

`indentedCode` 现在包含已有代码块末尾缩进足够的空白行，以及通向这些续行的中间空行；段落间距不作用于这些行。代码开头之前的空白、末尾缩进不足的空白仍保留原来的段落间距。列表中的判断仍以列表项文字起点为基准。解析与显示改动不写笔记，不改变媒体嵌入。

## Windows 宿主验证

2026-10-20，`vml-test-vault`，Obsidian 1.14.4，默认主题：

- 使用报告附件的独立副本；附件本身没有 Tab，按评论条件在三个正文段落前各加一个 Tab。附件图片未提供，以测试库的 `attachments/square-1x1.png` 替代，保留右浮动、宽度 0.4 和 `skip:2`。
- 真实按键通过 Electron debugger 的 `Input.dispatchKeyEvent` 发送，启用后台测量和焦点仿真。逐帧记录行高、正文高度及装饰变化，观察 600ms。
- 原 0.8.2 和未修改的 main `70523c9`（0.9.0）均复现：回车后约 6ms 新行按 16px 排版，约 89ms 再增加约 8px。临时取消 `flow-root` 仍复现。
- 修复构建：Tab／四个空格续行只发生一次正常排版变化；段中回车、首段回车、无缩进和源码模式对照均未出现该延迟变化。逐帧采样中，后续宿主解析未再改变行高。
- 核对回车后的全文恰好为预期换行及自动缩进；真实 Ctrl+Z 一次还原。测试副本恢复基线后，在缓冲与落盘文件分别核对 SHA-256；原有活动笔记未改动。截图检查正文与浮动布局，`dev:errors` 未捕获错误。
- 单元测试覆盖尾部 Tab／空格、间隔空行、前导空白、缩进不足的尾行和列表内代码；12 组测试边界已逐一与该宿主的 `computeMetadataAsync` 结果核对。`npm run check`：503 项通过；`npm run build` 通过。

测试库加载的 `main.js` 与仓库构建 SHA-256 一致：`3e4686b4f021fdb44e9a3295caac87bcb3e281c69c785c412696ff7d591dd1af`。

仅在上述 Windows 宿主复测；移动端及其他主题未复测。本记录不代表已发布版本。
