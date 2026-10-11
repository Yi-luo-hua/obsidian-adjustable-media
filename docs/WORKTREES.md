# 工作树与分支

更新：2026-10-12。公开版本是 0.7.3，main 是未发布的 0.8.0 候选。功能与验收见 [STATUS](STATUS.md)，待办见 [任务队列](plans/layout-redesign/09-progress-and-next-steps.md)。

当前 Git 仍登记 **7 棵工作树**：2 棵继续开发，5 棵已提交归档请求、尚未完成。历史审查和嵌套文档两棵已清理；本地分支由 33 个减为 9 个，远端由 29 个减为 7 个。

## 继续使用的工作树

| 目录 | 分支 | 用途与状态 |
| --- | --- | --- |
| `E:/TOOLS/obsidian-adjustable-media` | `main` | 0.8.0 发布准备与后续开发；发布代码基线 `740dcd6`，分支调整提交 `25ed9d5` 的 465 项检查、构建和 CI 通过 |
| `C:/Users/丁家宝/.codex/worktrees/independent-features/obsidian-adjustable-media` | `codex/w02-candidate-measurement` | W02／W03 未完成原型；HEAD `b3efef7`，保留 17 个修改文件与 16 个新增文件，尚未推送 |

## 需要保留的独立分支

| 分支 | 用途 |
| --- | --- |
| `codex/main-before-080` | 原 main 的完整历史，`3f31feb`；本地／远端均保留，无独立工作树 |
| `docs/readme-demo` | 未合入的 README 动图与素材，`d197c2f`；仅本地保留，无工作树，不混入此次发布 |

## 本次清理

已清理 24 个本地、22 个远端旧分支。已集成且未被工作树使用的分支，以及有明确替代来源的旧试验／发布索引分支，在验证 Git bundle 后移除；未合入的动图分支保留。`review-pr18` 的未提交文档与 `.review/`、嵌套历史文档树均已备份，目录移入回收站并核对原路径消失，Git 记录已清除；`.claude/launch.json` 保留。

以下 5 棵应用管理的工作树已由所属任务提交归档请求。工具多次返回 `queued`，尚未确认归档快照或目录移除，所以对应本地／远端分支继续保留。目录均位于 `C:/Users/丁家宝/.codex/worktrees/<名称>/obsidian-adjustable-media`。

| 名称 | 分支／HEAD | 当前状态 |
| --- | --- | --- |
| `pending-view-parity` | `codex/pending-view-parity` · `d163209` | 已集成，归档排队，干净 |
| `pending-render-stability` | `codex/pending-render-stability` · `0bcbfc9` | 已集成，归档排队，干净 |
| `android-adaptation` | `codex/android-adaptation` · `2321d44` | 已集成的旧来源树，含未提交修改；ZIP 已保存，不丢弃 |
| `mermaid-layout` | `codex/mermaid-layout` · `53c5f3a` | 已集成，归档排队，干净 |
| `mobile-release-integration` | `codex/mobile-release-integration` · `740dcd6` | main 的发布基线，归档排队，干净 |

实际结果以备份目录的 `cleanup-result.json`、应用归档记录与 `git worktree list` 为准。应用完成归档后再移除这 5 条旧分支；当前不把排队状态登记为已完成。

完整备份位于 `E:/TOOLS/obsidian-adjustable-media-backups/cleanup-20261012/`：Git bundle 保存分支、标签、完整历史和两份 stash；9 份 ZIP 保存文件、未提交内容及必要的忽略构建／证据，已逐文件核对 SHA-256。可重装的 `node_modules`、`.git` 元数据与目录链接未重复打包；主目录 `dist/` 原地保留。

清理只改变文档与开发目录，不改变插件实现、测试库或设备验收范围，也不推版本标签或公开发布。整理前的分支与过程记录见 [历史工作树快照](plans/layout-redesign/archive/36-worktree-integration-20261012.md)。

## 恢复

- 应用已归档工作树优先从原所属任务的归档记录恢复，再从备份 ZIP 补回需要的忽略文件。
- 被删除的分支可从 `repository-before.bundle` 恢复；Android 未提交状态目前保存在 ZIP 中，应用归档快照尚待生成，详见备份目录 README。
- 原主目录两份文档的 stash `ce9f46e7d726d56548b8db111360241d370d64e9`、W02／W03 的旧恢复 stash `276052785e29b2b26ead891092c9932bd63b3353` 继续保留。
