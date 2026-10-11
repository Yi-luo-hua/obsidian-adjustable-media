# 文档索引

更新：2026-10-10。项目有多个开发分支；本文链接的当前状态以主目录文档为入口，具体实现和验收注明所属分支与构建。

## 使用与发布

| 文档 | 用途 |
| --- | --- |
| [安装](INSTALL.md)／[常见问题](FAQ.md) | 安装、更新和使用限制 |
| [中英文功能示例](examples/README.md) | 插件内置的离线指南和手动分栏样例 |
| [项目状态](STATUS.md) | 当前公开版本、已交付功能、开发进展与限制 |
| [发布流程](RELEASE.md) | 版本号、构建、标签、附件和公开发布 |
| [各版本更新说明](releases) | 随插件打包的中英文弹窗正文 |

## 开发与计划

| 文档 | 用途 |
| --- | --- |
| [开发指南](../AGENTS.md) | 原文保护、代码约定、测试库与按影响验证 |
| [当前设计](DESIGN.md) | 主目录 0.7.3 分支实际实现的格式与宿主行为 |
| [领域词汇](../CONTEXT.md) | 布局块、浮动集合、并列组等定义 |
| [布局规划索引](plans/layout-redesign/README.md) | 仍有效的模型、规划、同步、格式与验收要求 |
| [任务队列](plans/layout-redesign/09-progress-and-next-steps.md) | W01–W11 的完成范围、依赖和下一步 |
| [工作树与交付顺序](plans/layout-redesign/36-worktree-and-android-priority.md) | 当前分支、工作目录、集成关系和恢复位置 |
| [Android 适配](plans/layout-redesign/mobile-adaptation.md) | 手机／平板优先范围、待做真机验收与后续 iOS 计划 |
| [手动文字分栏](plans/layout-redesign/34-text-column-breaks.md) | 已准备交付的 0.7.3 功能语义 |
| [拖动动画与预览](plans/layout-redesign/35-block-drag-animation-preview.md) | 已确认、尚未实现的 W03／W04／W11 需求 |
| [Mermaid 独立项](plans/layout-redesign/37-mermaid-layout-items.md) | 独立功能分支的并排、缩放、格式边界与桌面验证，未发布 |
| [ADR](adr) | proposed 决策及其接受条件 |

## 历史与证据

[历史记录索引](archive/README.md) 汇总早期发布验证、P1／P2 基础、独立功能迭代，以及 W01／W02／W03 的分支验收范围。历史页中的“当前”“未发布”和测试数量仅属于原批次。

[布局冲突研究](research/LAYOUT_CONFLICTS.md) 与 [基线探针](research/LAYOUT_PROBES.md) 保留研究起点的反例，不作为当前实现的预期行为。原始 JSON、截图和探针保留在原位置；没有将旧构建验收扩大为新组合构建验收。

维护时：版本与项目总状态更新 STATUS，工作包进度更新 09，分支／目录调整更新 36，实际代码行为更新 DESIGN。阶段性过程放归档，避免在多个当前入口反复追加同一状态。
