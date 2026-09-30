---
status: proposed
date: 2026-09-30
---

# 显式区分并列组与跨段浮动关系

当前块的宽度、wrap 与 skip 不能完整表达多个对象的并列、正文锚点和可实现位置。推荐保留原生正文编辑，分别建模 ParallelGroup 与 WrapSet／FlowRegion，再以共享规划和宿主测量驱动预览、实时预览和阅读视图；组内用 Grid，真正的跨段绕排仍由浮动关系处理。

只扩展邻块补偿会随排列增多继续失效；将所有正文环绕改成 Grid 会改变正文归属；全篇自由画布需要接管原生编辑，超出范围。首版明确组只在正常文档流单层呈现，旧 V2 浮动先独立改善。共享规划仍需实际正文尺寸，不能完全由纯数学位置替代宿主。

接受条件：P0a 证明候选测量与真实宿主结果一致，P1–P3 的数据、同步和预览门槛通过；并列组的格式／呈现另按 P0b／P0c 和 P4–P5 验收。否则修订适配方案及支持范围，不把 proposed 当成现行设计。

依据：[研究报告](../research/LAYOUT_CONFLICTS.md)、[模型与研判](../plans/layout-redesign/01-model-and-decisions.md)、[实施验收](../plans/layout-redesign/05-delivery-and-validation.md)。
