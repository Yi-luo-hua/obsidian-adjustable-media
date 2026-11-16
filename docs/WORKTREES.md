# 工作树与分支

核对日期：2026-11-16（基于 `git worktree list` 与 `git branch`）。当前公开状态与已知限制见 [项目状态](STATUS.md)，未完成任务见 [待办与路线图](plans/layout-redesign/09-progress-and-next-steps.md)。

## 当前工作树

| 目录 | 分支 / HEAD | 状态与说明 |
| --- | --- | --- |
| `E:/TOOLS/obsidian-adjustable-media` | `main` | 主仓库；当前已发布 **1.0.0** |
| `C:/Users/丁家宝/.codex/worktrees/independent-features/obsidian-adjustable-media` | `codex/w02-candidate-measurement` · `d680ce6` | **未合入原型**：W02 候选测量缓存与 W03 浮动约束原型 |

## 需关注的未合入 / 保留分支

- **`codex/w02-candidate-measurement`**（`d680ce6`）：唯一尚未合入的逻辑原型，对应 [任务队列](plans/layout-redesign/09-progress-and-next-steps.md) 中的 W02/W03。
- **`docs/readme-demo`**（`d197c2f`）：早期未合入的 README 动图分支（仅本地保留）。
- **`codex/main-before-080`**（`3f31feb`）：`0.8.0` 切换主线前的旧 `main` 历史备份分支。
- 其余约 40 个 `codex/*` 分支（如 `codex/prepare-0.9.1`、`codex/release-0.9.4`、`codex/excalidraw-layout` 等）均为已合入 `main` 并已发布的特性或发版分支，后续可按需统一清理。

## 历史备份位置

- 2026-10-14 工作树清理快照及旧恢复流程见 [工作树清理快照](archive/2026-10-14-worktree-cleanup.md)；完整历史 bundle 与 ZIP 备份保存在 `E:/TOOLS/obsidian-adjustable-media-backups/cleanup-20261012/`。
