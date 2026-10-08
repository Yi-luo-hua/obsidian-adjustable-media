# 华为平板真机验收

2026-10-09 续作：用户报告的误展开源码、侧栏冲突、顶部把手裁切已修复，398 项检查与新生产构建通过；370px 窄分屏下八次阅读切换均显示两个布局。新构建哈希、原生触摸写回／侧栏边界及人工待确认范围见 [21](21-mobile-touch-interaction-fixes.md)。以下保留初轮构建和失败观察，未把旧证据改写为新构建的完整验收。

日期：2026-10-08。用户恢复测试，USB 调试已连通。设备由用户提供为华为 11.5S；ADB 型号 TGR-W10，系统报告 HarmonyOS 4.2.0／Android 12、SDK 31，Obsidian 1.12.7。独立库 `adjustable-media-tablet-test`，正式 manifest 仍仅桌面端。本地改动未提交、合并或发布。

## 构建与范围

- 实际手机端 main.js 与仓库生产构建哈希一致：`7cd242a183af090250051150bf57819cc8415925513abb925714ba6fa0d67bfe`。
- 两项移动端屏幕样式修复后，390 项自动检查与生产构建通过：宽表格自滚动；编辑栏采用仅移动端的 flex 顺序与 sticky 操作栏，不改桌面 DOM 顺序或打印布局。
- 初始横屏 CSS 视口 1120 × 736，DPR 2.5；用户实际旋转后的竖屏 736 × 1120；系统半屏 556 × 736。
- 原手机基线见 [18](18-android-and-w01-acceptance.md)，输入按钮及源文候选原型见 [19](19-w10-w02-and-tablet-continuation.md)。不以旧手机构建验收新增按钮。
- 暂停前失败的 Windows 输入探针重新运行，修正测试类被 CodeMirror 覆盖、输入光标位置与亚像素取整后七项通过，原笔记哈希保持。证据 `w10-input-actions.json`；它是桌面辅助证据，另验真实平板。

## 已观察结果

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 首次阅读／实时预览、媒体与公式 | 真实 bundle 启用，图片／视频元数据／公式正常、几何为正；Worker 接受精确缓冲，missing／rejected 退路正常 | `tablet-baseline.json` |
| 宽表格 | 修复前表格宽 1772px，溢出 1045px 文字栏且没有自身滚动。移动端屏幕样式让 table 在自身盒子里横向滚动，不改源码、不影响打印。竖屏下表格盒宽 660.8px、文字栏 scrollWidth=clientWidth=661、整篇溢出 0，12 列保留 | `tablet-baseline-before-table-fix.json`、`tablet-baseline.json`、`tablet-wide.png` |
| 长浮动与旋转 | 用户真实横转竖；30 个 80ms 样本 scroll=906.400024、epoch=1、ready=true、替身=1，源与文件不变 | `tablet-portrait.json`／PNG |
| 系统半屏 | 用户实际系统分屏，视口 556 × 736。初次捕获阅读布局为空，待检查完成后的宿主状态，未标通过 | `tablet-half-wide.json`／PNG |
| Obsidian 分窗调用 | getLeaf(split, vertical) 后活动源码窗格可见，原阅读窗格宽高为 0。只观察到活动标签页，不能称双窗格通过；临时 leaf 已关闭、恢复原 leaf | `tablet-multi-pane.json` |
| 原生中文候选 | 用户在半屏输入拼音，候选待选阶段缓冲与文件精确回到原文。OEM 候选在原生层，CodeMirror composing=false；日志保留之前输入／删除事件，不宣称此前全过程都未写回 | `tablet-input-pending.json`／PNG |
| 候选确定与完成 | 用户真实选定“平板中文测试”后直接点完成，可信 input／click／focusout；编辑器退出，缓冲与保存文件一致，只改左栏自己的行 | `tablet-input-done.json`／PNG |
| 选区、复制与粘贴 | 用户原生选择、复制并粘贴一次，可信 paste 的文本为“平板中文测试”，只增加左栏第二份文字 | `tablet-input-pasted.json` |
| 原生历史与保存重开 | 一次 undo 只去掉粘贴，一次 redo 完整恢复。缓冲立即变化，文件保存分别约 2095.7／2051.7ms；早期 750ms 文件检查是等待不足，失败历史保留。重开后精确一致 | `tablet-input-history.json`，`*-unfocused.json`／`*-short-save-wait.json` |
| 键盘遮挡与无效草稿 | 半屏键盘显示时 app／cm 高 360px，旧操作栏 y=349–393，中心不在可点击区。移动端操作栏移到内容上方并 sticky 后，取消按钮中心 y=221、真实命中按钮，固定原生触摸序列闭合编辑器、零主编辑事务、文件与缓冲完整不变 | `tablet-keyboard-clipping.json`／PNG、`tablet-actions-visible.png`、`tablet-draft-controlled.json` |
| 宽表格半屏滑动 | 12 列保留，table 自身 scrollLeft=402.8，而整篇 scrollLeft=0、pane overflow=0、文件不变；使用真实 WebView 的原生 CDP 触摸输入 | `tablet-half-wide-swiped.json`／PNG |

半屏阅读初次空布局后续已由 [21](21-mobile-touch-interaction-fixes.md) 修复并通过八次切换回归。仍保留窄屏／全屏往返、平板前后台及全屏宿主多窗格能力矩阵。用户取消草稿时，click／focusout 当刻原文未变；随后出现一次单图 width=1 配置与额外“完成”点击，未把整个未隔离期间标为零写入。受控序列重新核对后通过；该配置变化保留在失败观察中，结束按专用 fixture 备份恢复。

W02 独立补充 Node 源码候选成本：200 块／10801 行，冷次 10.64ms，50 个暖样本 p50=6.15ms、p95=7.66ms、最大 8.91ms。`w02-candidate-build-performance.json` 只包含纯源码读回，不包含 DOM、宿主、Worker 或安卓 CPU，不能作为完整候选 p95 8ms 达标证明。W02 的几何与预算门槛独立验收，完整 W11 仍依赖 W03／W04；iOS 继续暂缓。

## 恢复约定

03 原始 194 字节测试文件已备份到 `dist/tablet-input-original.md`；每次输入保留 expected 原文，结束经校验后恢复并核对手机实际文件哈希。01／02／05 全程只读。临时 USB 常亮原值 0，结束恢复；CDP 使用平板专属 18710 forward，结束移除。桌面测试库原插件四个文件备份为 `dist/tablet-desktop-backup/`，结束恢复并核对。日常库未加载候选。

上述是本批次恢复约定。后续用户自行调整／移动的 01 保留最终操作结果；24 已完成手指复核、确认桌面恢复并将常亮恢复为 0、移除 18710 转发。当前状态与剩余项目见 [25](25-documentation-and-artifact-cleanup.md)。
