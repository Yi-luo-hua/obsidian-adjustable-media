# 工作树分工与 Android 优先交付

2026-10-10，按用户要求整理。当前公开版本仍为 0.7.2；0.7.3 已提交并推送到 `codex/text-column-breaks`，主目录检出该分支。本次不推送版本标签，不公开发布，不合并到 main。

## 分支与范围

| 分支 | 基线与职责 | 下一步 |
| --- | --- | --- |
| `codex/text-column-breaks` | 正式 0.7.2 + 0.7.3 手动分栏、点击修复及双语样例；主目录 | 保持可发布状态，其他增量独立审查 |
| `codex/pending-view-parity` | 0.7.3 + 远端 main 的 #17–#20；保留 W08、更新说明、图片适配和手动分栏 | 待合并的三视图／既有拖动修复；不含 W02 原型 |
| `codex/pending-render-stability` | 接三视图分支；W01 生命周期、离屏测量、渲染完成通知及尺寸变化保留播放器 | 共用渲染修复单独审查 |
| `codex/android-adaptation` | 接共用渲染分支；Android 手机／平板的触摸、输入、焦点与控件适配 | 优先完成 Android 相关剩余验收 |
| `codex/w02-candidate-measurement` | 原有候选测量及 W03 纯规划续作 | 保留未提交工作，不作为 Android 本轮交付依赖 |

待合并分支按依赖堆叠：`text-column-breaks → pending-view-parity → pending-render-stability → android-adaptation`。这表示代码依赖，不表示已经合并或发布；评审每一层时以其上一层为比较基线。旧 `codex/android-layout-stability` 留作完整历史来源，不再作为新的混合开发入口。

## 工作目录

- 主目录：`E:/TOOLS/obsidian-adjustable-media`，用于 0.7.3。
- 原独立功能工作树：`C:/Users/丁家宝/.codex/worktrees/independent-features/obsidian-adjustable-media`，现用于 W02／W03；目录保留旧名称。
- 三视图、渲染和 Android 使用各自新增工作树，实际路径以 `git worktree list` 为准。
- 历史 review-pr18 和 docs/tidy-task-plan 工作树保持原样。

W02／W03 的 33 个未提交文件已搬到原独立功能工作树，逐文件 SHA-256 一致；恢复快照与原构建保存在主目录忽略目录 `dist/worktree-reorganization-20261010/`，恢复 stash 为 `276052785e29b2b26ead891092c9932bd63b3353`。`.claude/`、历史审查修改、笔记及设置没有混入新提交。

## Android 本轮范围与优先级

用户选择先完成 Android 手机和平板，再推进 iPhone／iPad。沿用共用解析、渲染、写回及交互代码，仅保留已确认的平台适配；不等待 W02／W03 最终规划器。

1. 在 nova 12 定向重跑平板上已修复的源码误触、侧栏冲突、顶部／角落把手、输入禁区、视频播放与缩放焦点；检查普通滚动不会误写。
2. 在 11.5S 补全屏／分屏往返、旋转、前后台／系统中断、原生多窗格及相关手指操作。
3. 核验中文组字、完成／放弃无效草稿、保存重开、取消零写入、原文守恒及一步原生撤销；兼容 0.7.3 手动分栏。
4. 通过已列 Android 核心场景后再调整正式支持声明；现阶段 manifest 继续桌面限定。iPhone／iPad 未测，不能记为通过。

本次设备检查：ADB 已启动，无连接设备。分支拆分后的自动检查与构建另记；历史真机证据来自 `f7c8880` 的 [18](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/18-android-and-w01-acceptance.md)、[20](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/20-tablet-acceptance.md) 及 [21–24](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/24-mobile-video-controls-focus.md)，不把它们当成新组合构建的真机验收。

日常验证继续按 [AGENTS.md](../../../AGENTS.md) 的改动影响选择范围；W03／W04 的统一规划器触摸接入属于后续增量，不混入本轮 Android 基础适配。
