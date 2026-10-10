# 项目状态

更新：2026-10-11。本页汇总当前交付范围；工作包细节见 [任务队列](plans/layout-redesign/09-progress-and-next-steps.md)，分支与目录见 [工作树记录](plans/layout-redesign/36-worktree-and-android-priority.md)，历史验证见 [归档索引](archive/README.md)。

## 版本与交付范围

- **当前公开版本：[0.7.3](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/tag/0.7.3)**。2026-10-11（北京时间）正式发布并设为最新版本，标签源码为 `da4aea9`；保持原定桌面范围，新增手动文字分栏与点击修复，保留 0.7.2 已发布功能。
- **本次范围与验证**。主目录检出 `codex/text-column-breaks`，标签源码 `da4aea9`；保留原定 `+++` 手动文字分栏、文字栏切换／外框空隙点击修复及中英文样例。干净源码的类型检查、lint、327 项测试和生产发布构建通过；GitHub 发布流程成功，三份公开附件与统一 LF 换行的本地重建逐字节一致，来源签名全部核对至标签／源码提交及发布工作流。已列 Windows／Obsidian 1.14.4 定向实测范围见 [34](plans/layout-redesign/34-text-column-breaks.md)。
- **main 与发布附件来自不同源码线**。远端／本地 main 为 `3f31feb`，已合并发布索引 PR #22；本次只同步版本元数据与发布说明，不改 main 实现。main HEAD 不能当作 0.7.3 附件来源，下一次从 main 构建前仍需集成待合并分支以保留全部已发布功能。
- 所有准备交付分支仍声明 `isDesktopOnly: true`，笔记格式保持 V2，不迁移旧笔记。插件已在 Obsidian 社区目录中。

用户确认的交付边界（2026-10-10）：0.7.3 保持已确认的原定桌面内容，不追加三视图、共用渲染或 Android 增量；移动适配留到 Android、iPhone、iPad 一起验收后作为后续大版本交付。移动集成候选保留在 `codex/mobile-release-integration`，本轮本地集成没有推入 main；主目录继续检出 `codex/text-column-breaks`。后续大版本号尚未确定。

0.7.3 [正式发布](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/tag/0.7.3)及已合并的 [发布索引 PR #22](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/22)均已核对，main 检查通过；公开下载的三份文件哈希与草稿核验结果一致，正式 manifest 保持 `isDesktopOnly: true`。主目录默认 lint 会扫描未入库的 `.claude/` 历史工作树，本次 327 项检查在只含入库源码的副本中通过，没有修改这些历史工作树。

## 已有工作与当前边界

独立增量：`codex/mermaid-layout` 已实现 Mermaid 独立布局项、并排与缩放，以及块外图表直接拖入已有布局；追加修复尺寸调整的源码闪现、异步尺寸读取及阅读视图旧图保留问题。343 项检查和生产构建通过；Windows 专用测试库的直接拖入、取消、原文保护和一步撤销通过，此前相关操作／真实 PDF 导出验证保留。尚未合并或发布，移动真机未测。范围与开发格式见 [37](plans/layout-redesign/37-mermaid-layout-items.md)，不追加公开 0.7.3 或移动候选。下文各交付线的 V2／桌面声明继续适用于其原范围。

| 工作线 | 当前完成情况 | 仍待完成 |
| --- | --- | --- |
| 身份、关系、写入与每窗格基础 | P1／P2 基础已随 0.7.0 发布；0.7.1 修复交互缺陷 | 完整 R1／R2 不能由基础发布替代 |
| 三视图与既有拖动修复 | #17–#20 与 0.7.3 已合流；规范／需求审查、生产构建及本轮 Windows 定向回归通过；原 401 项自动检查范围保留 | 尚未合入 main 或进入正式附件 |
| 共用渲染稳定性 | 已修复审查发现的替身源码定位和测量副本释放问题；416 项检查、生产构建及 Windows 定向回归通过 | 尚未合入 main；本次不扩大旧 W01 的验收范围 |
| Android 手机／平板 | 已修复旧 WebView 手动栏点击定位；429 项检查、构建及代码 CI 通过；nova 12／11.5S 本轮已列相关验收通过，保存内容核对及收尾完成 | 保留为后续移动大版本的 Android 阶段结果，等待 iPhone／iPad 基础真机验收后统一交付；不加入 0.7.3，范围见 [Android 计划](plans/layout-redesign/mobile-adaptation.md) |
| 候选测量与完整规划 | W02 的 Windows 既有 V2 原型门槛通过；W03 纯约束基础已开始 | 正式接入、完整求解与 ready 契约、峰值优化；W02／W03 续作尚未提交 |
| 拖动动画与并列组 | 动画需求已确认；两项组相关 ADR 仍为 proposed | 动画尚未实现；W06／R2 尚未实施，组入口等待 ADR 接受且 P5 验收通过 |

327／401 属于前次分支整理；416／427 属于共用修复，429 包含 nova 12 发现的兼容性修复；W02／W03 原批次为 468。不同构建与范围分别记录。Windows／Obsidian 1.14.4 的定向回归见 [审查摘要](plans/layout-redesign/archive/branch-validation.md#2026-10-10-branch-review)；新组合 Android 手机／平板本轮已列相关验收通过，没有新增 iOS 真机验收。

## 已知限制与验收范围

- 阅读视图历史首次／快速虚拟滚动存在有限场景跳动；未证实根治，详见 [设计 4.1](DESIGN.md#41-文字环绕) 与 [历史验证](archive/validation-history.md)。
- W07 已用当前编辑缓冲的宿主顶层分块处理间距，等待／失败退路和列表内部仍用推断；W07 位于待合流源码，主目录 0.7.3 未包含它。标题、代码、表格、公式及换行仍有原生几何差异，见三视图分支的 DESIGN 4.3 和 [W07 摘要](plans/layout-redesign/archive/branch-validation.md#w07-host-paragraph-boundaries)。
- PDF 未设置文字字体时可能使用与屏幕不同的字体；纸张与连续画布自然换行／分页不能保证逐像素一致，见 [FAQ](FAQ.md)。
- 链接建议不支持 `^` 块引用和 `[[##` 全库标题；目标已有别名或尺寸后缀时不补全。
- 部分快捷键、设置、阅读高度和导出依赖内部接口。最低声明版本为 1.5.0；历史桌面实测为 Obsidian 1.13.7／1.14.4，移动已列场景为 1.12.7，不代表覆盖其他版本、主题与设备。
- iPhone／iPad 未部署或验收。Android 旧构建的基线不能充作最新修复的手机复测，也不能扩展为 iOS 支持。

文档入口见 [文档索引](README.md)，合并与发布继续按 [发布流程](RELEASE.md) 和具体任务授权进行。
