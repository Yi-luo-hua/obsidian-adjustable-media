# 工作树与分支

核对日期：2026-10-21。下表来自本机 `git worktree list` 和各目录的 `git status`，只描述该日期的目录状态；分支后续检出和提交以 Git 为准。公开版本与功能范围见 [STATUS](STATUS.md)，未完成工作见 [任务队列](plans/layout-redesign/09-progress-and-next-steps.md)。

## 当前目录快照

Git 登记 6 棵工作树。主目录本次从已更新的 `origin/main`（`616ac5b`）建立 `codex/docs-align-20261021` 进行文档对齐；切换前的 `codex/fix-indented-newline-jump` 为 `75bb922`，源码树与该 main 一致。其余 5 棵工作树在核对时均无未提交修改。

| 目录 | 分支／HEAD | 用途与状态 |
| --- | --- | --- |
| `E:/TOOLS/obsidian-adjustable-media` | `codex/docs-align-20261021`，基于 `616ac5b` | 本次文档更新；公开版本仍为 0.9.0，Issue #27 修复已合入 main、未发布 |
| `C:/Users/丁家宝/.codex/worktrees/independent-features/obsidian-adjustable-media` | `codex/w02-candidate-measurement` · `d680ce6` | W02 缓存／会话与 W03 约束原型已提交，工作树干净；未进入 main，不视为完整规划器交付 |
| `C:/Users/丁家宝/.codex/worktrees/callout-review-fixes/obsidian-adjustable-media` | `codex/callout-review-fixes` · `5d145bd` | 0.9.0 Callout 来源树，干净，目录保留 |
| `C:/Users/丁家宝/.codex/worktrees/canvas-support/obsidian-adjustable-media` | `codex/canvas-support` · `d05b012` | 0.9.0 Canvas 来源树，干净，目录保留 |
| `C:/Users/丁家宝/.codex/worktrees/fix-external-file-urls/obsidian-adjustable-media` | `codex/fix-external-file-urls` · `5f2ee62` | 0.9.0 库外媒体来源树，干净，目录保留 |
| `C:/Users/丁家宝/.codex/worktrees/fix-layout-body-alignment/obsidian-adjustable-media` | `codex/fix-layout-body-alignment` · `e3d4bf0` | 0.9.0 布局正文对齐来源树，干净，目录保留 |

旧文档中 W02／W03 的“17 个修改文件＋16 个新增文件”属于提交前快照，不能继续作为当前未提交计数。其后续实现与证据仍在原型工作树；main 未复制完整候选测量／规划器模块。

## 保留分支与历史清理

- `codex/main-before-080`：原 main 的完整历史，`3f31feb`。
- `docs/readme-demo`：未合入的 README 动图与素材，`d197c2f`，无独立工作树。
- 已集成的来源分支和当前目录未在本次文档任务中清理；保留目录不表示其功能尚未发布。

2026-10-14 的 8 棵工作树、5 项应用归档排队请求及当时分支数量已移至 [清理快照](archive/2026-10-14-worktree-cleanup.md)。其中部分目录不再出现在当前 Git 清单；本次没有查询原任务的应用归档回执，不能据此认定归档快照已成功生成。不要再把旧排队清单作为当前待处理目录。

## 恢复入口

历史完整备份位置为 `E:/TOOLS/obsidian-adjustable-media-backups/cleanup-20261012/`：`repository-before.bundle` 保存分支、标签与 stash，ZIP 保存当时工作树及必要的忽略文件。逐文件核验属于原清理批次，本次未重新校验备份内容；恢复步骤见备份目录 README 及 [清理快照](archive/2026-10-14-worktree-cleanup.md)。

应用管理的工作树优先从原任务的归档记录恢复；其他历史内容按备份 README 恢复。stash 应按固定提交身份查找，序号会变化；本次核对仍存在：

- `ce9f46e7d726d56548b8db111360241d370d64e9`：切换主目录前的文档。
- `276052785e29b2b26ead891092c9932bd63b3353`：W02／W03 的旧恢复状态。
- `a33cddee8591186f84cceae4681f608d0aa4731c`：同步 PR #28／#30 前保留的主目录本地更新。

本次只调整文档与开发分支，没有移动或删除工作树、清理分支、恢复 stash 或操作测试库。
