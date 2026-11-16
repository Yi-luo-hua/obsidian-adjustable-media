# 历史归档索引

更新于 2026-11-16。本索引汇集所有已完成的阶段记录、问题排查与发版核验。当前现状请看 [项目状态](../STATUS.md) 与 [设计说明](../DESIGN.md)，未完成计划请看 [09 待办与路线图](../plans/layout-redesign/09-progress-and-next-steps.md)。

## 问题排查与功能修复记录（`docs/archive/`）

| 记录 | 内容 |
| --- | --- |
| [阅读列表、间距与切换稳定性](2026-11-06-reading-list-and-scroll.md) | 0.9.5 列表逐项避让浮动、可见文字锚点与切换稳定性 |
| [保留原生编辑的视图间距对齐](2026-11-06-view-parity.md) | 0.9.5 标题/空行/水平线间距在实时预览与阅读视图的对齐 |
| [模式切换重复测量优化](2026-11-06-mode-switch-performance.md) | 0.9.5 隐藏窗格环境缓存与可见段扫描优化 |
| [水平线结束布局环绕](2026-11-06-horizontal-rule-wrap.md) | 0.9.5 顶层 `hr` 清除左右浮动与首帧跳动修复 |
| [editor 初始化兼容修复](2026-11-05-editor-initialization.md) | 0.9.4 新文档打开时 `MarkdownView.editor` getter 异常处理 |
| [Issue #37 阅读模式破图排查](2026-11-04-reading-image-issue37.md) | 阅读模式两列图片加载与附件覆盖刷新差异排查 |
| [Issue #34 图文块整体缩放](2026-10-22-text-media-frame-resize.md) | 0.9.1 `frameWidth` 外框独立缩放与窄图文块对齐 |
| [Issue #27 缩进续行修复](2026-10-20-indented-newline-jump.md) | 0.9.1 缩进代码末尾空行回车跳动修复 |
| [0.9.0 Canvas 卡片支持](2026-10-19-canvas-support.md) | Canvas 文字与 Markdown 文件卡片布局适配 |
| [0.8.2 远处连续空行修复](2026-10-15-distant-blank-lines.md) | 移除远离布局的连续空行折叠规则 |
| [2026-10-14 工作树清理快照](2026-10-14-worktree-cleanup.md) | 10 月工作树备份与分支清理记录 |
| [0.8.1 把手与布局相邻空行修复](2026-10-14-layout-handles-and-spacing.md) | 框外把手裁剪与布局上下连续空行修复 |
| [0.8.0 合流与验收过程](0.8.0-integration-and-validation.md) | 0.8.0 合并前的逐次提交与设备验收历程 |
| [早期版本验证](validation-history.md) | 0.4.0、GPT-2 三视图/PDF 对照与早期 159 项检查记录 |

## 布局规划历史批次（`docs/plans/layout-redesign/archive/`）

| 记录 | 内容 |
| --- | --- |
| [方案二次核验](../plans/layout-redesign/archive/06-plan-verification.md) | 2026-09-30 源码反例与方案修订 |
| [P1 首批实施](../plans/layout-redesign/archive/07-execution-record.md) | 文档快照、运行期身份与写入保护基础 |
| [P2 每窗格基础](../plans/layout-redesign/archive/08-pane-foundation-record.md) | 每窗格同步/缓存、PR #12 修复与分批验证 |
| [W07 宿主段落边界](../plans/layout-redesign/archive/10-host-paragraph-boundary-record.md) / [验收](../plans/layout-redesign/archive/11-host-paragraph-boundary-acceptance.md) / [审查修复](../plans/layout-redesign/archive/12-paragraph-spacing-review-fixes.md) | 宿主顶层分块与 PR #20 阶段记录 |
| [独立功能迭代](../plans/layout-redesign/archive/independent-features.md) | 0.7.2 与 0.7.3 迭代过程记录 |
| [后续分支验收摘要](../plans/layout-redesign/archive/branch-validation.md) | W07、W01、Android、W02 与 W03 的历史分支范围摘要 |
| [旧工作树整理快照](../plans/layout-redesign/archive/36-worktree-integration-20261012.md) | 2026-10-12 清理前的工作树堆叠过程 |

## 各版本发布核验（`docs/releases/`）

每次公开版本的构建哈希、CI 运行与来源证明核验保留在 `docs/releases/*-readiness.md`（覆盖 0.8.0–1.0.0），各版本弹窗正文保留在 `docs/releases/*.en.md` 与 `*.zh-CN.md`（其中 `0.7.3`、`0.8.0`、`1.0.0` 同时被代码或单元测试引用）。

原始探测数据、截图与基准 JSON 保留在 `docs/plans/layout-redesign/probes/`（其中 `p1-performance.json` 由 `scripts/layout-snapshot-benchmark.mjs` 写入）。完整历史备份位于 `E:/TOOLS/obsidian-adjustable-media-backups/cleanup-20261012/`。
