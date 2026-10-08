# 移动端视频控件与笔记焦点

2026-10-09，主人报告点击播放后弹出输入栏，光标移到第一行。华为 11.5S／Obsidian 1.12.7，独立平板测试库，743 × 736 视口。

## 已确认的路径与修改

现场 `tablet-video-play-misfocus.json` 记录主编辑器获得焦点、selection=0、mod-toolbar-open；没有文字栏编辑框。独立 09 fixture 的原生播放按钮没有复现该焦点跳转；修复后用户在原页手指复核回复“没问题了”。

另外确认两条相关路径：

- Obsidian 移动端在主编辑器代理 `img,video` 点击，对 video 也调用 preventDefault。视频现在隔离指针、触摸、点击与键盘事件向编辑器的冒泡，保留原生默认操作；滚动与布局媒体菜单继续使用原路径。
- 布局尺寸写回原先为恢复桌面键盘撤销而调用主编辑器 focus。在移动端，这会唤起笔记输入栏，显示原来保存的远处光标。现在仅桌面恢复焦点；移动端仍使用同一编辑器事务保存和撤销，保持当前焦点。mod-toolbar-open 属于输入 UI 状态，环境签名不再把它视为重画理由，实际宽度及字体仍独立读取。

保留 23 的尺寸增量更新及写回校验，不改媒体嵌入或主人的笔记原文。

## 最新构建与验证

类型检查、官方 lint、407 项测试及生产构建通过。播放器事件测试验证 stopPropagation 而不取消默认行为；原有真实事务测试新增桌面恢复焦点、移动端保存但不聚焦的断言，环境测试新增输入栏显隐不重画断言。

main.js 本机／ADB SHA-256：`ff0e440cc258f2448feec85910fee7856f448e8a7f5b871b6b924360ad392c2a`。styles.css 沿用 `b2012bec744d6250b7fc336b247cc1c77f92deb8203c3294307cc7c8b1a5f914`。

| 最新生产构建真机检查 | 结果 |
| --- | --- |
| 原生触摸播放／暂停 | 播放状态切换正常，selection 保持 128，toolbar=false，原文及 video 不变 |
| 原生进度条触摸 | currentTime 从 2 秒跳至约 0.751 秒，光标及原文不变，输入栏关闭 |
| 已聚焦正文时缩放 | 保留原布局／video、移除 0、加载事件 0、持续播放、保存一致 |
| 未聚焦正文时缩放 | 同样保留播放器和播放，正文未获得焦点，toolbar=false，光标保持末尾映射位置 |
| Windows 输入辅助回归 | 七项通过，原笔记未改，四个插件文件恢复原哈希并重载 |

证据为 `tablet-video-controls-play-fixed.json`、`tablet-video-controls-pause-fixed.json`、`tablet-video-controls-seek-fixed.json`、`tablet-video-controls-resize-fixed.json`、`tablet-video-controls-resize-blurred-fixed.json` 及 `w10-input-actions.json`。原生触摸脚本保存为 `tablet-video-controls-start.js.txt`／`touch`／`seek`／`state`，缩放复用 23 的脚本。

诊断过程的失败观测保留：`tablet-video-controls-resize-focus-before.json` 是只隔离播放器事件、尚未修复写回自动聚焦时的重建；`tablet-video-controls-seek-offscreen.json` 点击了屏幕外，不计为进度条验收。鼠标诊断仅用于核对事件冒泡，不能替代手指场景。

09／07 专用 fixture 已移入测试库回收目录；自动化期间主人的 01，包括手动调整的 0.998／203、0.617 等设置，完整保留。平板回到 01 视频并关闭输入栏，selection=418，然后用户手指复核回复“没问题了”。随后采集 `tablet-video-controls-manual-fixed.json`：文件保存一致、输入栏关闭。用户还移动了视频块至图片块之前，并继续调整宽度、点击正文和图片，当前 video 与复测开始时不同、光标变为 8；该混合操作记录不能充当“只改尺寸保留同一节点”的证据，该结论使用前述隔离 fixture。用户手动操作的最终笔记已保留，未恢复旧原文。

自动回归与用户确认汇总为 `tablet-video-controls-report.json`。桌面四文件恢复报告已保存，USB 临时常亮已恢复原值 0，18710 本轮调试转发已移除，调试观察器已停止。正式 manifest 仍仅桌面端，未提交／合并／发布，完整 W10／W11／iOS 门槛保留。
