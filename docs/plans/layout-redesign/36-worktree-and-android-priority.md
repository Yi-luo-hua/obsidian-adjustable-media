# 工作树分工与 Android 优先交付

更新：2026-10-10。本页维护工作树、分支依赖与交付顺序；版本总状态见 [STATUS](../../STATUS.md)，工作包完成范围见 [09](09-progress-and-next-steps.md)。当前公开版本仍为 0.7.2；0.7.3 已提交推送并成为主目录基线，标签、公开发布和合入 main 尚未进行。

## 分支与范围

| 分支 | 本轮内容基线 | 基线与职责 | 下一步 |
| --- | --- | --- | --- |
| `codex/text-column-breaks` | `c1572bd` 文档整理 | 正式 0.7.2 + 0.7.3 手动分栏、点击修复及双语样例；主目录 | 保持可发布状态，标签／公开发布待安排 |
| `codex/pending-view-parity` | `7963b0f` 文档合流 | 0.7.3 + 远端 main 的 #17–#20；保留已发布独立功能 | 本轮审查和 Windows 定向回归通过，待集成 |
| `codex/pending-render-stability` | `bf8dcd8` 审查修复 | 接三视图分支；W01、离屏测量、完成通知及播放器保留 | 416 项检查、构建与 Windows 定向回归通过，待集成 |
| `codex/android-adaptation` | `a0bf98b` 旧 WebView 定位修复 | 接共用渲染分支；手机／平板触摸、输入、焦点与控件 | 429 项检查、构建及代码 CI 通过；nova 12／11.5S 本轮已列相关验收通过，待集成／交付 |
| `codex/w02-candidate-measurement` | `b3efef7`，未推送 | 候选测量及未提交的 W02／W03 续作 | 保留原工作，不作为 Android 本轮交付依赖 |

待合并分支按依赖堆叠：`text-column-breaks → pending-view-parity → pending-render-stability → android-adaptation`。这表示代码依赖，不表示已经合并或发布；评审每一层时以其上一层为比较基线。旧 `codex/android-layout-stability` 留作完整历史来源，不再作为新的混合开发入口。

表中提交固定本轮内容基线，后续文档同步会继续推进各分支 HEAD；实时位置以 `git worktree list` 与对应远端分支为准。

远端 main 为 `5bd34e7`，正式 0.7.2 标签为 `df37e08`；本地 main 仍为 `7fcd086`，落后远端 5 个提交，当前没有工作树检出 main。本次核对不改变这些分支或版本标签。

## 交付与集成规则

0.7.3 可按自身验收范围交付；三视图、共用渲染和移动适配分别审查与集成，不把后续完整规划器／并列组装进同一个发布增量。Android 优先表示本轮工作优先级，不要求先公开发布三视图或渲染版本才允许做真机回归。

bug 修复按主要职责归入对应工作线，设备验证范围单独记录；在平板发现的播放器保留属于共用渲染，移动写回焦点属于平台适配。文档、样例和诊断维护随对应功能交付。

下一次从 main 发布前，必须集成已经发布的 W08、更新弹窗与图片适配修复；本次三视图待合并分支已完成源码合流，但尚未合入 main。0.7.3 手动分栏与 W06 多块组区分，独立交付不等待组格式或全设备矩阵。

## 工作目录

- 主目录：`E:/TOOLS/obsidian-adjustable-media`，用于 0.7.3。
- 原独立功能工作树：`C:/Users/丁家宝/.codex/worktrees/independent-features/obsidian-adjustable-media`，现用于 W02／W03；目录保留旧名称。
- 三视图：`C:/Users/丁家宝/.codex/worktrees/pending-view-parity/obsidian-adjustable-media`。
- 共用渲染：`C:/Users/丁家宝/.codex/worktrees/pending-render-stability/obsidian-adjustable-media`。
- Android：`C:/Users/丁家宝/.codex/worktrees/android-adaptation/obsidian-adjustable-media`。
- 历史 review-pr18 和 docs/tidy-task-plan 工作树保持原样。

W02／W03 的 33 个未提交文件已搬到原独立功能工作树，逐文件 SHA-256 一致；恢复快照与原构建保存在主目录忽略目录 `dist/worktree-reorganization-20261010/`，恢复 stash 为 `276052785e29b2b26ead891092c9932bd63b3353`。`.claude/`、历史审查修改、笔记及设置没有混入新提交。

## Android 本轮安排

用户选择先完成 Android 手机／平板，再推进 iPhone／iPad。nova 12／11.5S 的新组合构建本轮已列相关验收通过，保存内容已核对，测试收尾完成，保留测试笔记的手动尺寸调整；新旧构建与已测／未测范围见 [Android 适配](mobile-adaptation.md)。本轮草稿按钮反馈确认为普通文字状态下预期禁用；正式平台支持声明、合入 main 和公开发布尚未进行。历史证据仍见 [摘要](archive/branch-validation.md#android-phone-and-tablet)。

## 分支整理时的检查与提交

- 0.7.3 实现提交 `664198c` 已推送；类型检查、lint、327 项测试及发布构建通过，主目录再次生产构建通过。
- 三视图分支 `40104f7` 已推送；类型检查、lint、401 项测试及生产构建通过。解决合流后的宿主解析／高亮冲突，补齐原回归测试的依赖；保留 0.7.3 点击与手动分栏用例。
- 共用渲染分支 `c993001` 已推送；类型检查、lint、415 项测试及生产构建通过。只提取 W01／播放器相关模块及语义回归，不带候选提供者、触摸控制或输入按钮。
- Android 实现提交 `a92d38b` 已推送，类型检查、lint、426 项测试及生产构建通过。提取现有触摸／输入／焦点修复、真机工具和对应回归；保留 0.7.2 悬停高亮及 0.7.3 分栏／点击／更新说明。新组合构建的宿主／真机验收仍待进行，不能直接沿用历史通过结论。
- W02／W03 的 33 个文件再次核对，哈希差异为 0。恢复 stash 保留；没有重置该开发线，也没有把它的未完成模块放入上述待合并分支。

日常验证继续按 [AGENTS.md](../../../AGENTS.md) 的改动影响选择范围；W03／W04 的统一规划器触摸接入属于后续增量，不混入本轮 Android 基础适配。

文档整理将旧 28 的交付分类／顺序并入本页，候选与发布过程并入 [独立功能归档](archive/independent-features.md)。整理结果已提交并沿依赖同步；本轮两项共用渲染修复及 Windows 定向回归见 [审查摘要](archive/branch-validation.md#2026-10-10-branch-review)。main、版本标签及公开发布保持原状态。
