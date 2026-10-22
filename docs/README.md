# 文档索引

更新：2026-10-22。公开版本为 0.9.0；main 已合入 Issue #27 缩进续行和 #34 图文块整体缩放修复，0.9.1 在发布准备分支中打包，尚未发布。项目状态以 STATUS 和 DESIGN 为入口，实际检出分支与独立原型见 WORKTREES 的日期快照；具体实现和验收注明所属分支与构建，历史快照单独保留。

## 使用与发布

| 文档 | 用途 |
| --- | --- |
| [安装](INSTALL.md)／[常见问题](FAQ.md) | 安装、更新和使用限制 |
| [中英文功能示例](examples/README.md) | 插件内置的离线指南、手动分栏和 Mermaid 样例 |
| [项目状态](STATUS.md) | 当前公开版本、已交付功能、开发进展与限制 |
| [发布流程](RELEASE.md) | 版本号、构建、标签、附件和公开发布 |
| [0.9.1 发布准备](releases/0.9.1-readiness.md) | 图文块缩放与缩进续行补丁、候选包及验证边界 |
| [0.9.0 发布核验](releases/0.9.0-readiness.md) | Canvas、Callout、Mermaid 菜单与显示修复的发布范围和核验 |
| [0.8.2 发布核验](releases/0.8.2-readiness.md) | 正文连续空行与引用跳转修复、附件签名及验证边界 |
| [0.8.1 发布核验](releases/0.8.1-readiness.md) | 实时预览把手与空行补丁、附件签名及验证边界 |
| [0.8.0 发布准备](releases/0.8.0-readiness.md) | 固定源码、本地附件、验收边界与正式发布步骤 |
| [各版本更新说明](releases) | 随插件打包的中英文弹窗正文 |

## 开发与计划

| 文档 | 用途 |
| --- | --- |
| [开发指南](../AGENTS.md) | 原文保护、代码约定、测试库与按影响验证 |
| [当前设计](DESIGN.md) | main 实际实现的格式与宿主行为，保留旧 V2 说明 |
| [领域词汇](../CONTEXT.md) | 布局块、浮动集合、并列组等定义 |
| [布局规划索引](plans/layout-redesign/README.md) | 仍有效的模型、规划、同步、格式与验收要求 |
| [任务队列](plans/layout-redesign/09-progress-and-next-steps.md) | W01–W11 的完成范围、依赖和下一步 |
| [工作树与分支](WORKTREES.md) | 当前目录快照、独立原型、保留分支和历史备份入口 |
| [移动适配记录](plans/layout-redesign/mobile-adaptation.md) | 各平台已测构建、Mermaid 增量和未复测范围 |
| [手动文字分栏](plans/layout-redesign/34-text-column-breaks.md) | 已发布的 0.7.3 功能语义 |
| [拖动动画与预览](plans/layout-redesign/35-block-drag-animation-preview.md) | 已确认、尚未实现的 W03／W04／W11 需求 |
| [Mermaid 独立项](plans/layout-redesign/37-mermaid-layout-items.md) | 0.8.0 已发布的单块图表项、格式边界和历史验证 |
| [ADR](adr) | proposed 决策及其接受条件 |

## 历史与证据

[历史记录索引](archive/README.md) 汇总早期发布验证、P1／P2 基础、独立功能迭代，以及 W01／W02／W03 的分支验收范围。历史页中的“当前”“未发布”和测试数量仅属于原批次。

[布局冲突研究](research/LAYOUT_CONFLICTS.md) 与 [基线探针](research/LAYOUT_PROBES.md) 保留研究起点的反例，不作为当前实现的预期行为。原始 JSON、截图和探针保留在原位置；没有将旧构建验收扩大为新组合构建验收。

维护时：版本与项目总状态更新 STATUS，工作包进度更新 09，分支／目录调整更新 WORKTREES，实际代码行为更新 DESIGN。阶段性过程放归档，避免在多个当前入口反复追加同一状态。
