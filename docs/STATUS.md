# 项目状态

更新于 2026-11-16。当前公开最新版本为 **1.0.0**。尚未完成与待推进事项统一维护在 [待办与路线图](plans/layout-redesign/09-progress-and-next-steps.md)。

## 版本与交付状态

当前版本核心能力见 [README](../README.zh-CN.md) 与 [更新日志](../CHANGELOG.md)。各版本打包与核验记录独立保存在 `docs/releases/`：

| 版本 | 日期 | 主要内容 | 核验记录 |
| --- | --- | --- | --- |
| **1.0.0** | 2026-11-16 | 窄块横向自由摆放、自定义边框颜色、阅读视图浮动后空行保留与首帧切阅读稳定性、Maple 水平线与 Cursor-Smith 空行光标修复 | [1.0.0 核验](releases/1.0.0-readiness.md) |
| 0.9.8 | 2026-11-15 | 整组图注、阅读模式布局边框开关 | [0.9.8 核验](releases/0.9.8-readiness.md) |
| 0.9.7 | 2026-11-13 | 围栏旁输入防抖、普通/环绕布局留白对齐、默认关闭边框常亮 | [0.9.7 核验](releases/0.9.7-readiness.md) |
| 0.9.6 | 2026-11-09 | 单项图注字号（100%–200%）、Underwater 主题同行图片修正、表格单元格右键菜单 | [0.9.6 核验](releases/0.9.6-readiness.md) |
| 0.9.5 | 2026-11-07 | 水平线结束环绕、双视图排版间距/列表/滚动位置对齐、模式切换性能优化 | [0.9.5 核验](releases/0.9.5-readiness.md) |
| 0.9.4 | 2026-11-05 | 网页嵌入布局（`<iframe>`/YouTube/Twitter）及独立高度、editor 初始化兼容修复 | [0.9.4 核验](releases/0.9.4-readiness.md) |
| 0.9.3 | 2026-11-02 | 本地 Excalidraw 绘图布局、Markdown 表格右键包装为文字块（表格独立媒体适配已回退） | [0.9.3 核验](releases/0.9.3-readiness.md) |
| 0.9.2 | 2026-10-24 | 行内图片拆分包装、转换后收起选区并直接渲染布局 | [0.9.2 核验](releases/0.9.2-readiness.md) |
| 0.9.1 | 2026-10-22 | 图文块外框独立缩放与对齐（#34）、缩进代码回车跳动修复（#27） | [0.9.1 核验](releases/0.9.1-readiness.md) |
| 0.9.0 | 2026-10-20 | Canvas 卡片布局、Callout 单图缩放（#26）、Mermaid 右键包装、主题把手裁剪与正文对齐修复 | [0.9.0 核验](releases/0.9.0-readiness.md) |
| 0.8.2 | 2026-10-15 | 远离布局的正文连续空行保留、交叉引用点击防展开源码（#23） | [0.8.2 核验](releases/0.8.2-readiness.md) |
| 0.8.1 | 2026-10-14 | 实时预览把手框外裁剪与布局上下空行补丁 | [0.8.1 核验](releases/0.8.1-readiness.md) |
| 0.8.0 | 2026-10-11 | Mermaid 独立媒体项（V3）、Android / iPhone / iPad 移动端支持 | [0.8.0 核验](releases/0.8.0-readiness.md) |

## 当前已知限制与 Open Issues

- **Issue [#37](https://github.com/Yi-luo-hua/obsidian-adjustable-media/issues/37)**（Open，未认定修复）：报告阅读模式两列图片破图。常规路径测试均正常；在临时覆盖附件文件的受控场景下曾复现编辑缓存与阅读刷新不同步（[排查记录](archive/2026-11-04-reading-image-issue37.md)），仍待原始笔记与环境复现信息。
- **Issue [#29](https://github.com/Yi-luo-hua/obsidian-adjustable-media/issues/29)**（Open，未认定修复）：报告靠右浮动图片使上方正文变半宽。测试库暂未复现，仍待最小复现笔记与主题/CSS 片段信息。
- **移动端验证范围边界**：`0.8.0` 完成了 Android / iPhone / iPad 基础验证；`0.9.0`–`1.0.0` 新增与调整的功能（Canvas、Callout 缩放、Excalidraw、表格包装、网页嵌入、整组图注、窄块横向摆放、阅读视图空白与列表对齐等）均未在移动端真机复测，详见 [移动适配记录](plans/layout-redesign/mobile-adaptation.md)。
- **功能边界**：
  - 全库批量移除只处理 Markdown 文件中可编辑的顶层布局注释，不扫描 Canvas 文字卡片，也不移除 Callout 图片设置。
  - Canvas 仅支持卡片内部布局，不支持跨卡片拖放布局或 Canvas 内交叉引用跳转。
  - 阅读视图首次/快速虚拟滚动及列表内部仍有少量原生几何差异；屏幕与 PDF 的字体、换行和分页依赖宿主配置。
  - 链接建议不支持 `^` 块引用或 `[[##` 全库标题。

## 遗留分支与规划队列

- 完整浮动规划器（W02/W03 原型 `codex/w02-candidate-measurement`）、拖动动画预览（`35`）及并列组（W06/R2，两份 ADR 仍为 `proposed`）均未合入 `main`，详见 [待办与路线图](plans/layout-redesign/09-progress-and-next-steps.md) 与 [工作树与分支](WORKTREES.md)。
- 历史逐次验证、早期探针与清理快照统一留在 [历史归档索引](archive/README.md)。
