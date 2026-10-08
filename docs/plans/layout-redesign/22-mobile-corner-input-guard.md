# 移动端角落把手与输入禁区

后续视频缩放的播放器保留与原生媒体控件豁免见 [23](23-video-resize-player-preservation.md)。本页保留角落修复的独立构建记录。

截至 2026-10-09，最新视频角落缩放已随 [24](24-mobile-video-controls-focus.md) 通过用户实际手指复核；镜像角落等专项仍仅按本页原生 CDP 证据记录。当前构建与剩余门槛见 [25](25-documentation-and-artifact-cleanup.md)。

2026-10-09，用户继续报告右下角缩放把手裁切、触摸困难，以及误触下一行文字输入。沿用华为 11.5S 独立库，真实 CSS 视口为 743 × 736；不覆盖用户自行调整后的 01 设置。

## 修复

- 原角落把手为 16 × 16px，`right/bottom: -8px`，实际伸出 `contain: paint` 的部件。移动端改为框内 44 × 44px 圆形按钮，中心标记为 24px，层级高于侧边／底边把手；左侧镜像角落同样向框内收。
- 在角落按钮边界外扩 64px 的范围阻止普通指针、触摸与点击进入文字输入。范围只取当前源码窗格内、与窗格相交的角落把手，不关联其他窗格或离屏布局；实际把手、明确按钮与链接保留操作。
- 记录角落触摸的所属指针，释放后拦截它紧随的点击，即使布局重排后落点变成了下一行文字。下一次明确按下即清除记录，取消拖动不留下记录；无坐标的键盘激活保持正常，带真实坐标的宿主合成触摸点击仍受保护。
- 缩放计算与写回流程沿用原实现，未更改存储格式、媒体嵌入、历史或其他平台的样式。

## 验证

类型、官方 lint 与 403 项测试通过；生产构建成功。本机与 ADB 上实际文件 SHA-256 一致：

| 文件 | SHA-256 |
| --- | --- |
| main.js | `4b33975d3b0aba5e548ca5e815b18c4ca8edad2e511ccd4e0e0de4c091c701f2` |
| styles.css | `b2012bec744d6250b7fc336b247cc1c77f92deb8203c3294307cc7c8b1a5f914` |

在新建的独立 06 fixture 放置媒体布局和紧邻的文字布局，使用真实 WebView CDP 触摸：

| 场景 | 结果 |
| --- | --- |
| 修复前点击下一行右端 | 打开文字栏编辑器，复现误触；原文未变 |
| 新构建点击同一位置 | 编辑器未打开，没有新焦点事件或源码展开，原文不变 |
| 点击角落按钮 | 编辑器未打开，原文不变；圆形按钮上／下／左／右四点均命中把手 |
| 角落拖动缩放 | 设置写回成功，未打开文字栏／源码，只改变设置注释，随后按 expected 原文恢复 fixture |
| 取消角落拖动 | 原文不变，未打开文字栏／源码 |
| 点击禁区外的同一文字栏 | 正常进入编辑，原文不变 |
| 镜像角落 | 44 × 44px，完全位于框内，四点命中；测试设置恢复成功 |

汇总 [tablet-corner-report.json](probes/tablet-corner-report.json) 的 `passed=true`。明细为 `tablet-corner-input-before.json`、`tablet-corner-near-text.json`、`tablet-corner-corner-tap.json`、`tablet-corner-corner-drag.json`、`tablet-corner-corner-cancel.json`、`tablet-corner-normal-text.json`、`tablet-corner-mirrored.json`；截图 `tablet-corner-before.png`、`tablet-corner-fixed.png`。

本批次 06 在源精确等于测试初始文本时移入测试库回收目录，并恢复 01。01 在本轮开始／结束的完整源一致，保留用户此前自行调整的高度 190、列宽和视频单行宽度。当时角落手感待复核；后续视频角落手指缩放已在 24 通过。未提交、合并或发布，其他设备与完整 W11 门槛保留。
