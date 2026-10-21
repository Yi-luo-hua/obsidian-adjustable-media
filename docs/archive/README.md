# 历史记录与证据索引

更新：2026-10-21。历史页按原日期、分支、构建和观测范围读取，其中“当前”“未发布”“下一批”不代表今天的工作状态。当前入口是 [STATUS](../STATUS.md)、[09 任务队列](../plans/layout-redesign/09-progress-and-next-steps.md) 与 [WORKTREES](../WORKTREES.md)。

| 记录 | 保留范围 |
| --- | --- |
| [早期版本验证](validation-history.md) | 0.4.0、滚动与撤销、GPT-2 三视图／PDF，以及早期 159 项检查记录 |
| [方案二次核验](../plans/layout-redesign/archive/06-plan-verification.md) | 2026-09-30 的源码反例和方案修订；有效要求已经保留在 01–05 |
| [P1 首批实施](../plans/layout-redesign/archive/07-execution-record.md) | 快照、运行期身份、入口保护与原构建证据 |
| [P2 每窗格基础](../plans/layout-redesign/archive/08-pane-foundation-record.md) | 基础同步／缓存、PR #12 修复与分批宿主验证 |
| [独立功能迭代](../plans/layout-redesign/archive/independent-features.md) | 0.7.2 候选与发布过程、0.7.3 的逐次点击修复和样例确认 |
| [后续分支验收摘要](../plans/layout-redesign/archive/branch-validation.md) | W07、W01、Android、W02 与 W03 的来源、结果及当前未验收边界 |
| [W07 实施记录](../plans/layout-redesign/archive/10-host-paragraph-boundary-record.md)／[验收](../plans/layout-redesign/archive/11-host-paragraph-boundary-acceptance.md)／[审查修复](../plans/layout-redesign/archive/12-paragraph-spacing-review-fixes.md) | 已完成的宿主分块与 PR #20 阶段记录；当前行为见 DESIGN |
| [0.8.0 合流验收过程](0.8.0-integration-and-validation.md) | 从 STATUS 收敛出的逐次提交、测试数量、设备结果及保存核对边界 |
| [旧工作树整理快照](../plans/layout-redesign/archive/36-worktree-integration-20261012.md) | 清理前的分支堆叠、工作树路径和集成过程；当前结构见 WORKTREES |
| [2026-10-14 工作树清理快照](2026-10-14-worktree-cleanup.md) | 当时的 8 棵工作树、应用归档排队与恢复信息，不代表当前目录清单 |
| [0.8.1 把手与布局相邻空行修复](2026-10-14-layout-handles-and-spacing.md) | 原宿主失败场景、修复构建和 Windows 验证 |
| [0.8.2 远处连续空行修复](2026-10-15-distant-blank-lines.md) | 正文空行与行号问题的原批次验证 |
| [0.9.0 Canvas 卡片支持](2026-10-19-canvas-support.md) | 卡片来源、写回、预览及 PR #32 复用段落修复；未测范围保留 |
| [Issue #27 缩进续行修复](2026-10-20-indented-newline-jump.md) | PR #33 已合入 main，公开 0.9.0 未包含；原修复构建与 Windows 验证 |

原始 probes、截图与 JSON 没有批量移动或删除，引用仍指向原文件或固定提交。W02／W03 原型与续作已在原工作树提交为 `d680ce6`，2026-10-21 核对该目录干净；摘要不把这些模块复制进主目录源码，也不扩大原构建验收范围。

10 月 10 日整理的原文件恢复副本仍在 `dist/docs-cleanup-20261010/`。10 月 12 日清理前的 Git 全历史、stash、9 棵工作树文件和忽略构建证据另存于 `E:/TOOLS/obsidian-adjustable-media-backups/cleanup-20261012/`，ZIP 已逐文件核对 SHA-256；恢复步骤见其中 README。旧版更新说明与内置样例继续保留，历史证据不作为新构建通过的证明。
