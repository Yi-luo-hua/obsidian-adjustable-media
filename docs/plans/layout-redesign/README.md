# 布局改进计划索引

更新：2026-10-10。本目录保存仍有效的设计约定与任务；实现状态统一见 [09](09-progress-and-next-steps.md)，版本状态见 [STATUS](../../STATUS.md)，工作树与交付范围见 [36](36-worktree-and-android-priority.md)。计划中的接口、并列组和动画不自动成为主目录现行实现。

## 当前计划

| 文档 | 职责 |
| --- | --- |
| [领域词汇](../../../CONTEXT.md) | 块、组、浮动集合、锚点与环绕范围 |
| [01 模型与决策](01-model-and-decisions.md) | 不变量、可实现位置与替代方案 |
| [02 规划与交互](02-planner-and-interactions.md) | 意图、最终源码、measuring／ready／blocked、写回与历史 |
| [03 同步与测量](03-view-sync-and-measurement.md) | 精确来源、窗格、环境、候选测量与失效 |
| [04 并列组与格式](04-groups-and-format.md) | 待验证的新关系、版本边界、组内操作及导出 |
| [05 交付与验收](05-delivery-and-validation.md) | P0–P6 的进入／退出条件、用例与冻结性能口径 |
| [09 任务队列](09-progress-and-next-steps.md) | W01–W11 的当前完成范围与执行优先级 |
| [34 手动分栏](34-text-column-breaks.md) | 0.7.3 已确定语义，与多块并列组区分 |
| [35 拖动动画与预览](35-block-drag-animation-preview.md) | 已确认、尚未实现的可选动画与完整预览 |
| [36 工作树与交付](36-worktree-and-android-priority.md) | 分支、工作目录、堆叠集成与恢复信息 |
| [Android 适配](mobile-adaptation.md) | 本轮手机／平板定向验收和后续 iOS 范围 |

## 工作包与依赖

| 工作包 | 交付内容 | 依赖 |
| --- | --- | --- |
| P0a | 既有 V2、来源与候选可实现性原型 | 实际宿主与原文保护 |
| P1 | 关系快照、运行期身份及统一写入保护 | P0a 数据契约；基础已发布 |
| P2 | 每窗格同步、环境与候选缓存 | P1；生命周期与候选原型按各自范围验收 |
| P3 | 完整 V2 浮动规划、预览、菜单和拖动 | P1／P2 及 W02 门槛；W03／W04 继续 |
| P4 | 并列组格式、读写与降级 | P1、P0b 格式原型及 ADR |
| P5 | 组的呈现、直接编辑、交互与实际导出 | P2／P3／P4、P0c 组编辑／分页原型 |
| P6／R1 | 既有 V2 的完整集成验收 | W01–W04；每个准备交付增量单独验收 |
| P6／R2 | 新组关系的集成验收 | P1–P5；组入口还须 ADR 接受且 P5 通过 |

R1 与 R2 分别交付；组格式未知项不阻塞已具备前提的旧 V2 工作。Android 本轮适配和 0.7.3 独立功能按其实际范围推进，不等待完整规划器或全设备矩阵。

[ADR 0001](../../adr/0001-explicit-layout-relations.md) 与 [ADR 0002](../../adr/0002-versioned-flat-groups.md) 仍为 proposed。相邻块不会仅因视觉并排而自动写成组；运行期身份不写入笔记，旧 V2 不批量迁移。实际代码行为只随对应验收更新 [DESIGN](../../DESIGN.md)。

## 历史入口

研究起点为 `34f5896`／0.6.1 的 [布局冲突研究](../../research/LAYOUT_CONFLICTS.md)。二次核验、P1／P2 基础与独立功能逐次记录已移到 [历史索引](../../archive/README.md)；W01／Android／W02／W03 的分支原始范围见 [验收摘要](archive/branch-validation.md)。不再把这些旧“下一批”作为当前任务入口。
