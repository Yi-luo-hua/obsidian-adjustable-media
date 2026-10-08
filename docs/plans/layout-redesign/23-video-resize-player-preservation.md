# 视频缩放后保留播放器

本页保留 406 项检查及对应构建的历史记录。后续移动端写回焦点／播放器事件修复、最新 407 项检查和原页手指播放／暂停／角落缩放确认见 [24](24-mobile-video-controls-focus.md)。共用 `w10-input-actions.json` 已更新为 24 的最新回归，当前状态见 [25](25-documentation-and-artifact-cleanup.md)。

2026-10-09，用户报告视频调整大小后因刷新抽搐。设备仍为华为 11.5S／Obsidian 1.12.7，独立平板测试库，本轮视口 743 × 736。

## 原因与修复

真实触摸复现显示：松手写入尺寸后，LayoutWidget 的内容版本变化，整个布局 DOM 被替换。视频被移除一次，新播放器发出 loadstart／loadedmetadata，原来正在播放的视频变为暂停。证据 `tablet-video-resize-before.json`。

对同一运行期块、来源、窗格环境及引用编号，只改宽度、高度、列权重或位置的修改，现在更新现有布局的 CSS 尺寸，保留连在文档中的媒体元素与 Markdown 组件。同步替换交互上下文中的块／模型，并更新捕获初始尺寸的手柄，连续拖动使用最新尺寸。视频来源、媒体顺序、图注、文字／编号、排版结构、未知设置或环境发生变化时，仍走完整渲染。

浮动替身沿用同一增量更新，并校验运行期身份、来源／环境、skip 与编号；更新映射后的源锚点，防止旧位置参与写回。媒体晚加载时只更新仍按比例分配的列，避免覆盖已经写入的列权重。角落输入禁区保留原生视频／音频控件的操作；缩放结束的关联误点击仍由所属指针拦截。

尺寸计算、媒体嵌入与写回边界不变，不以刷新后恢复 currentTime 代替保留播放器。

## 最终验证

类型、官方 lint、406 项测试与生产构建通过。新增尺寸编辑真实写回／读回、媒体／图注重画边界、文字／结构／未知设置不可复用的三项测试。

| 文件 | 本机和 ADB 实际 SHA-256 |
| --- | --- |
| main.js | `4489ce31a4a71665a1cbf71abe869379440bcf065c234a6533837e2ae9b9b5b7` |
| styles.css | `b2012bec744d6250b7fc336b247cc1c77f92deb8203c3294307cc7c8b1a5f914` |

| 真实 WebView 触摸场景 | 结果 |
| --- | --- |
| 普通视频布局缩放 | 同一个布局／video，移除数 0，235 个样本均保持原播放器并持续播放，媒体重新加载事件 0，保存成功 |
| 连续两次缩放 | 第二次继续缩小约 25px，使用最新交互模型，不回到第一轮尺寸；仍是原播放器 |
| 一步撤销／重做 | 原文精确回到第一／第二次尺寸，文件保存一致；播放器与播放状态保留 |
| 浮动替身缩放 | 实际要求存在 `.vml-wrap-proxy__live video`，同一布局／video、移除数 0、重新加载事件 0、播放连续，保存成功 |
| Windows 输入辅助回归 | 七项通过，原笔记哈希不变；四个插件文件已恢复原哈希并重载 |

汇总 `tablet-video-resize-report.json` 的 passed=true；明细为 `tablet-video-resize-fixed.json`、`tablet-video-resize-history.json`、`tablet-video-resize-proxy.json`。原生触摸脚本 `tablet-video-resize-start.js.txt`、`tablet-video-resize-again.js.txt`、`tablet-video-resize-history.js.txt`、`tablet-video-resize-result.js.txt`；浮动版本复用该脚本，独立 08 fixture 使用 wrap=right／skip=30 并滚动至 900px，要求命中可见替身角落。

本批次 07／08 仅改专用 fixture 的设置注释，结束移入测试库回收目录，01 完整原文保持不变。桌面恢复见 `tablet-video-desktop-restoration.json`；当时手指画面待复核，随后发现的聚焦问题已在 24 修复，用户回复“没问题了”。正式 manifest 仍仅桌面端；未提交、合并或发布，完整 W10／W11 门槛保留。
