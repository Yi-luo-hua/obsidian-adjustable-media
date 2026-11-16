# 布局改进计划索引

更新于 2026-11-16。本目录存放架构改进的中长期规划文档与未完成规格；当前代码已实现行为以 [设计说明](../../DESIGN.md) 为准，公开状态见 [项目状态](../../STATUS.md)，未完成任务统一追踪在 [09 待办与路线图](09-progress-and-next-steps.md)。

## 规划与规格文档

| 文档 | 内容与状态 |
| --- | --- |
| [领域词汇](../../../CONTEXT.md) | 布局块、并列组、浮动集合、正文锚点与环绕范围定义 |
| [01 模型与决策](01-model-and-decisions.md) | 不变量、`ParallelGroup` 与 `WrapSet + FlowRegion` 模型研判（规划中） |
| [02 规划与交互](02-planner-and-interactions.md) | 意图、最终源码、`measuring/ready/blocked`、写回与历史（规划中） |
| [03 同步与测量](03-view-sync-and-measurement.md) | 精确来源、窗格环境、候选测量与失效（P1/P2 基础已发布，W02 原型待接入） |
| [04 并列组与格式](04-groups-and-format.md) | 跨块并列组格式、版本边界、导出与降级（未实施） |
| [05 交付与验收](05-delivery-and-validation.md) | P0–P6 进入/退出条件、用例与性能口径 |
| [09 待办与路线图](09-progress-and-next-steps.md) | 未完成任务队列与已交付项汇总 |
| [35 拖动动画与预览](35-block-drag-animation-preview.md) | 已确认、尚未实现的整块拖动动画与完整预览规格 |
| [34 手动文字分栏](34-text-column-breaks.md) | 已于 0.7.3 发布的功能规格（与并列组无关） |
| [37 Mermaid 独立项](37-mermaid-layout-items.md) | 已于 0.8.0 发布、0.9.0 补充右键包装的单块 V3 规格 |
| [移动适配记录](mobile-adaptation.md) | Android / iPhone / iPad `0.8.0` 真机记录与 `0.9.0–1.0.0` 未复测范围 |

## 架构决策记录（ADR）

- [ADR 0001](../../adr/0001-explicit-layout-relations.md) 与 [ADR 0002](../../adr/0002-versioned-flat-groups.md) 仍为 `proposed`。
- 已发布的 `v:3, kind:"media"` 用于单块 Mermaid（0.8.0）和网页嵌入（0.9.4）；未来实施多块并列组时须采用独立 `kind` 与格式校验，不直接复用 `kind:"media"`。

## 历史背景

- 研究起点与反例见 [布局冲突研究](../../research/LAYOUT_CONFLICTS.md)；P1/P2 实施记录、早期分支审查与工作树快照已移至 [archive](archive/) 与 [历史归档索引](../../archive/README.md)。
