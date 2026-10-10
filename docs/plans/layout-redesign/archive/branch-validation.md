# 分支验收摘要

整理日期：2026-10-10。以下汇总原构建证据，当前任务与交付状态见 [09](../09-progress-and-next-steps.md) 和 [STATUS](../../../STATUS.md)。本次文档整理没有重新运行代码检查、宿主或真机验收。

## W07 host paragraph boundaries

W07 随 PR #20 合入 main，包含 Setext H1 和引用定义间距修复；仍未进入 0.7.2 或主目录 0.7.3 的正式发布包。原记录包含 24 种边界、70 次真实结构编辑、启动／索引排队、三视图对照，以及修复后的 369 项检查和 15 个宿主场景。等待／失败退路和列表内部继续用推断规则。

详细矩阵保存在 `codex/pending-view-parity` 的 10–12 记录及原始 probes；[原验收记录](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/d2287f7/docs/plans/layout-redesign/11-host-paragraph-boundary-acceptance.md) 与 [修复记录](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/d2287f7/docs/plans/layout-redesign/12-paragraph-spacing-review-fixes.md) 保留各自范围。新合流分支的 401 项自动检查不表示重跑了所有原宿主场景。

## W01 Windows lifecycle

Windows／Obsidian 1.14.4 的已列生命周期门槛及最终生产对照通过，覆盖慢资源、冷 MathJax、网络字体、离屏浮动、折叠／直接编辑、真实分歧缓冲及清理。原实现来自 `f7c8880`，现在已拆入共用渲染分支；新组合构建的宿主回归仍待进行。

[16 生命周期记录](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/16-lifecycle-execution-record.md) 和 [18 最终门槛](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/18-android-and-w01-acceptance.md) 保留构建、范围和恢复信息。已列 Windows 门槛通过不等于 R1 或全部平台验收完成。

## Android phone and tablet

nova 12 基线和 11.5S 已列输入／显示／触摸／视频场景有真实设备证据。视频播放、暂停和角落缩放最后得到用户原页手指确认；此前手机基线不能替代对后来平板修复的手机复测。当前 Android 新组合分支只有自动检查和构建结果，真机验收按用户要求延期。

原始记录：[20 平板](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/20-tablet-acceptance.md)、[21 触摸](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/21-mobile-touch-interaction-fixes.md)、[22 角落与输入](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/22-mobile-corner-input-guard.md)、[23 播放器保留](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/23-video-resize-player-preservation.md)、[24 视频焦点](https://github.com/Yi-luo-hua/obsidian-adjustable-media/blob/f7c8880/docs/plans/layout-redesign/24-mobile-video-controls-focus.md)。当前剩余工作统一见 [Android 计划](../mobile-adaptation.md)。

## W02 candidate prototype

来源是 `codex/w02-candidate-measurement` 工作树：已提交 `b3efef7`，其后的 32 记录与实现续作尚未提交，未推送／合并／发布。下列是 2026-10-09 的 Windows／Obsidian 1.14.4、Node 24.11.1、Ryzen 9 7945HX 范围；不是主目录 0.7.3 实现。

| 证据 | 原结果与边界 |
| --- | --- |
| 原型与检查 | 468 项检查及生产构建通过，包含 W03 的 7 项纯约束用例；既有 V2 的 W02 原型退出条件满足 |
| 纯候选计算 | 完整依赖／身份校验后，真实宿主最慢组 p95 4.7ms，Node 6.64ms；不是 W03 完整规划计算或冷副本初始化 |
| 原生阅读对照 | 51 组合最大误差 0.008704px；200 块／400 正文片段／10000 文本行全量对照最大误差 0.017578px |
| 资源与 session | 18 个资源／失败／取消场景通过；缓存命中、宽度失效、模式切换和永久销毁经过双视图验证，副本为 0 |
| 冷测与峰值 | 阅读 4.55–4.78 秒，实时预览 13.51–17.41 秒；存在 51–73ms 长任务，完整浏览器帧上限未证实 |

冻结的预算是纯候选计算 p95≤8ms、测量／应用回调按同帧累计 p95≤16ms；峰值和 ≥50ms 长任务另列并继续优化。保留测量副本测后销毁，不转为常驻预热。完整基线／保护正文／EOF 只读依赖、当前 context、事件 refresh 和 dispose 是调用方责任；状态读取不能代替事件订阅，纯滚动不推进环境代际。

这些 API 尚未安装到正式菜单／拖动入口，首轮完整相关集合还未按影响结束证明缩小。正式事件适配、峰值优化、完整规划及 R1 保留其门槛。

原始 29–32 文档、脚本与 JSON 留在 W02 工作树，位置见 [36](../36-worktree-and-android-priority.md)。其中 32 记录的生产 main.js SHA-256 为 `9c3fcf8a368acc3c745c5ad9256e4e474bbd57e766dd225ba3e6d763125861e4`；该哈希只属于原批次，不能用作当前主目录构建证明。

## W03 float constraints

33 记录与 `floatConstraints.ts` 为同一未提交续作。纯模块根据原生 border-box、外边距和正文纵向片段计算同侧重叠／异侧通道不足，7 项语义用例通过；正文阈值 `max(行高 × 6, 120px)` 仍需真实场景校准。

真实边距与普通正文流接线、用户意图、源顺序、skip 上限、EOF、多块修改合并和版本化 ready 契约仍待完成。无约束违反不等于 ready，已有几何不能平移成新候选；须从最终源码重新读回、测量，再比较实际提交／重开。拖动动画需求已登记，尚未实现。
