# 工作树分工与 Android 优先交付

更新：2026-10-12。本页维护工作树、分支依赖与交付顺序；版本总状态见 [STATUS](../../../STATUS.md)，工作包完成范围见 [09](../09-progress-and-next-steps.md)。当前公开版本为 0.7.3；统一 0.8.0 候选已成为 main，主目录也切换到 main，旧 main 的完整历史保留为独立分支。

## 分支与范围

| 分支 | 本轮内容基线 | 基线与职责 | 下一步 |
| --- | --- | --- | --- |
| `main` | `740dcd6`，后续只同步分支状态文档 | 统一 0.8.0 候选，主目录当前开发与发布准备入口 | 465 项检查、生产构建与基线 CI 通过；尚未公开发布 |
| `codex/main-before-080` | `3f31feb` | 主线调整前的 main，完整历史独立保留 | 本地／远端均保存；无单独工作树，需要续作时再检出 |
| `codex/text-column-breaks` | `89b4b66`／标签 `0.7.3` 为 `da4aea9` | 正式 0.7.2 + 0.7.3 原定桌面功能，旧分支保留 | 已正式发布；原主目录两份未提交文档另存 stash 和备份 |
| `codex/pending-view-parity` | `7963b0f` 文档合流 | 0.7.3 + 远端 main 的 #17–#20；保留已发布独立功能 | 本轮审查和 Windows 定向回归通过，待集成 |
| `codex/pending-render-stability` | `bf8dcd8` 审查修复 | 接三视图分支；W01、离屏测量、完成通知及播放器保留 | 416 项检查、构建与 Windows 定向回归通过，待集成 |
| `codex/android-adaptation` | `2321d44` + 本地 iOS 修复／整理 | 四类设备既有验收源 | 已验收改动复制到移动集成候选；源工作树保持原状态 |
| `codex/mobile-release-integration` | `740dcd6` | 已提升为 main 的固定发布候选，原专用工作树保留 | 465 项检查／构建／CI 通过；11.5S 新手势通过，手机／iOS 新手势未复测；后续工作从主目录 main 推进 |
| `codex/mermaid-layout` | `53c5f3a` | Mermaid 桌面历史和已验收源码 | 已接入移动候选；源分支保持不变 |
| `codex/release-073-index` | `39889e5` | 只同步 0.7.3 的版本元数据与发布索引，不改 main 实现 | PR #22 已合并到 main（3f31feb），main 检查通过；工作树已归档，可恢复 |
| `codex/w02-candidate-measurement` | `b3efef7`，未推送 | 候选测量及未提交的 W02／W03 续作 | 保留原工作，不作为 Android 本轮交付依赖 |


此前各独立分支按依赖堆叠：`text-column-breaks → pending-view-parity → pending-render-stability → android-adaptation`，随后与 Mermaid 一起进入统一候选，现已成为 main。原工作树与各自证据保留；这不表示 0.8.0 已公开发布。W02／W03 仍为独立未完成原型。

表中提交固定本轮内容基线，后续文档同步会继续推进各分支 HEAD；实时位置以 `git worktree list` 与对应远端分支为准。

主目录检出 main，发布代码基线为 `740dcd6`；原 main `3f31feb` 已完整保留为 `codex/main-before-080`。正式 0.7.3 标签仍为 `da4aea9`，版本标签与公开发布状态见 STATUS。

## 交付与集成规则

0.7.3 可按自身验收范围交付；三视图、共用渲染和移动适配分别审查与集成，不把后续完整规划器／并列组装进同一个发布增量。Android 优先表示本轮工作优先级，不要求先公开发布三视图或渲染版本才允许做真机回归。

用户于 2026-10-12 更新安排：统一的 0.8.0 发布候选成为 main，原 main 转为独立分支，主目录随之切换。既有各平台结果与新 V3 图表验收分开；主线调整不改变未验收范围，也不包含公开发布。原“先 Mermaid、再移动”的两版安排已由统一候选取代。

bug 修复按主要职责归入对应工作线，设备验证范围单独记录；在平板发现的播放器保留属于共用渲染，移动写回焦点属于平台适配。文档、样例和诊断维护随对应功能交付。

当前 main 已保留发布过的 W08、手动分栏、更新弹窗与图片适配修复。0.7.3 手动分栏与 W06 多块组区分；未完成的组格式与完整规划器继续单独推进。

## 工作目录

- 主目录：`E:/TOOLS/obsidian-adjustable-media`，检出 main，用于当前 0.8.0 发布准备。
- 移动候选原工作树：`C:/Users/丁家宝/.codex/worktrees/mobile-release-integration/obsidian-adjustable-media`，保留 `740dcd6` 固定候选。
- 原主目录文档备份：`dist/main-promotion-20261012/`；stash 的完整 SHA 保存于其中 `primary-documents-stash.txt`，未应用到新 main。
- 原独立功能工作树：`C:/Users/丁家宝/.codex/worktrees/independent-features/obsidian-adjustable-media`，现用于 W02／W03；目录保留旧名称。
- 三视图：`C:/Users/丁家宝/.codex/worktrees/pending-view-parity/obsidian-adjustable-media`。
- 共用渲染：`C:/Users/丁家宝/.codex/worktrees/pending-render-stability/obsidian-adjustable-media`。
- Android：`C:/Users/丁家宝/.codex/worktrees/android-adaptation/obsidian-adjustable-media`。
- Mermaid：`C:/Users/丁家宝/.codex/worktrees/mermaid-layout/obsidian-adjustable-media`。
- 0.7.3 发布索引工作树已归档，可恢复；分支 `codex/release-073-index` 保留，PR #22 已合并。
- 历史 review-pr18 和 docs/tidy-task-plan 工作树保持原样。

W02／W03 的 33 个未提交文件已搬到原独立功能工作树，逐文件 SHA-256 一致；恢复快照与原构建保存在主目录忽略目录 `dist/worktree-reorganization-20261010/`，恢复 stash 为 `276052785e29b2b26ead891092c9932bd63b3353`。`.claude/`、历史审查修改、笔记及设置没有混入新提交。

## Android 本轮安排

用户选择先完成 Android 手机／平板，再推进 iPhone／iPad，并在三类移动平台验收后统一交付后续移动大版本。nova 12／11.5S 的新组合构建本轮已列相关验收通过，保存内容已核对，测试收尾完成，保留测试笔记的手动尺寸调整；新旧构建与已测／未测范围见 [Android 适配](../mobile-adaptation.md)。本轮草稿按钮反馈确认为普通文字状态下预期禁用；正式平台支持声明、合入 main 和公开发布尚未进行。历史证据仍见 [摘要](branch-validation.md#android-phone-and-tablet)。

## 分支整理时的检查与提交

- 0.7.3 实现提交 `664198c` 已推送；类型检查、lint、327 项测试及发布构建通过，主目录再次生产构建通过。
- 三视图分支 `40104f7` 已推送；类型检查、lint、401 项测试及生产构建通过。解决合流后的宿主解析／高亮冲突，补齐原回归测试的依赖；保留 0.7.3 点击与手动分栏用例。
- 共用渲染分支 `c993001` 已推送；类型检查、lint、415 项测试及生产构建通过。只提取 W01／播放器相关模块及语义回归，不带候选提供者、触摸控制或输入按钮。
- Android 实现提交 `a92d38b` 已推送，类型检查、lint、426 项测试及生产构建通过。提取现有触摸／输入／焦点修复、真机工具和对应回归；保留 0.7.2 悬停高亮及 0.7.3 分栏／点击／更新说明。新组合构建的宿主／真机验收仍待进行，不能直接沿用历史通过结论。
- W02／W03 的 33 个文件再次核对，哈希差异为 0。恢复 stash 保留；没有重置该开发线，也没有把它的未完成模块放入上述待合并分支。

日常验证继续按 [AGENTS.md](../../../../AGENTS.md) 的改动影响选择范围；W03／W04 的统一规划器触摸接入属于后续增量，不混入本轮 Android 基础适配。

文档整理将旧 28 的交付分类／顺序并入本页，候选与发布过程并入 [独立功能归档](independent-features.md)。整理结果已提交并沿依赖同步；本轮两项共用渲染修复及 Windows 定向回归见 [审查摘要](branch-validation.md#2026-10-10-branch-review)。0.7.3 正式标签／发布及 main 发布索引已完成，其他功能与移动候选未合入 main。
