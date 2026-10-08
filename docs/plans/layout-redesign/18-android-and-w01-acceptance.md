# Android 续测与 W01 剩余门槛

日期：2026-10-08。本地分支 `codex/cursor-border-highlight`，未提交、合并或发布。前一轮暂停记录见 [17](17-w01-and-android-continuation.md)。iPhone 13 Pro Max 按用户要求暂缓，以下手机证据来自华为 nova 12（ADB 型号 ADA_AL00U，Android 12／SDK 31，Obsidian 1.12.7），独立库 `adjustable-media-mobile-test`。

## 修复与原因

1. Android 首次阅读时，宿主可能先处理 section，再切入最终 preview 状态。布局切换现在为缺少 reader 的实际阅读窗格建立 reader 并安排渲染，不需要用户强制 rerender。
2. 长浮动原锚点离屏时，环境失效会清除尺寸，单靠可见 DOM 无法重新测量。现在在所属编辑窗格内建立只读测量容器，使用实际内容宽度和字体渲染上游浮动，取得有效尺寸后释放。零宽／零高结果继续 pending，不污染尺寸缓存；过期回调与销毁仍受现有令牌保护，不写笔记。
3. 竖屏和滚动抽搐来自宿主 UI 状态类：`keyboard-animating`、`is-hidden-nav`、`hide-cursor` 来回变化，被当成布局环境变化，导致所有 widget 重建、尺寸清空。环境签名排除这三个瞬态类，实际宽度、字体、主题、资源变化继续单独失效。修复前视频节点不断换新，高度在约 411px 与 144px 间切换；修复后真实触摸滚动样本中 epoch 为 0、视频节点 id 为 1、readyState 为 4、高度为 410.791656px，滚动范围 0–274.074066px。没有修改用户行高或嵌入文本。
4. W01 追加 FontFaceSet `loading` 失效，避免网络字体尚在下载时沿用旧 settled。当前 V2 测量按每个源／环境／观测范围最多 16 轮，超限撤回 ready，保持 pending；有效新资源、内容或环境可恢复。这不是 W02 的候选测量预算。

## W01 桌面退出证据

Windows／Obsidian 1.14.4 的已列生命周期矩阵见 [16](16-lifecycle-execution-record.md)，本轮补齐原先保留的冷 MathJax、网络字体、真实分歧缓冲和停止规则。以下构建与范围可作为 W02 的进入依据，完整 R1、候选与提交后边界误差、其他平台仍按各自工作包验收。

- 最终 `npm run check`：379 项通过，类型检查、官方 lint、生产构建通过。
- 最终生产 main.js SHA-256：`b06981d9c95f07c8d4e014b6f4ceac8f402f1e87a616d87b42c399e7cd0153fc`。
- 最终诊断 main.js SHA-256：`ef28b819d97992195390192ce391c784ecc1c6c627664460a3ca2d456705ad06`。只在诊断 bundle 插桩，不进入生产接口。
- 真正关闭并重开专用测试库窗口，启动时 MathJax 不存在，两种视图首次公式渲染后收敛。真实延迟 1700ms 网络字体下载期间两窗格保持 pending，完成后各自 epoch 前进并收敛。
- 两个原生 CodeMirror 文档的未保存缓冲不同，分别核对缓冲与磁盘；只临时暂停宿主保存／同步，不伪造读源接口，插件零强制覆盖。
- 40 次真实 guard read 在 16 轮后停止，旧 ready 撤回；有效资源后恢复。真实阅读 section 注入交替错误高度，40 次求解最多 16 次复测，环境失效后恢复。
- 稳定 2.2 秒零新源／环境请求、零布局 effect、零 wrap read，原笔记哈希保持。
- 最终生产与诊断在相同容器下首次打开长浮动中段，两种视图均为 398.359344 × 5780.538086px，实时预览 1 个替身、阅读 61 个替身。原笔记不变。先前使用不同窗口宽度比较的失败样本单独保留，不能当作生产几何回归。
- 证据：`w01-remaining-gates.json`、`w01-first-middle.json`、`w01-production-smoke.json`，及此前 `w01-lifecycle.json`／`w01-lifecycle-extra.json`；失败历史保留。

## Android 已验证与边界

| 范围 | 结果与证据 |
| --- | --- |
| 加载、首轮阅读、实时预览、图片／视频首帧／公式 | 专用库最终生产 bundle 基线全部通过；`android-final-baseline.json`。正式 manifest 仍为 desktop only，仅测试候选允许移动端。 |
| Worker 当前精确缓冲、missing／rejected 退路 | 真实手机接口可用，临时缺失／拒绝时布局仍显示，恢复接口后正常；只读原文不变。 |
| 中文输入、保存重开、一步撤销／重做 | 用户手指点击文字栏，手机输入法输入“手机中文测试”；只改变左栏自己的行，其余文字与嵌入不变。原生一步撤销恢复精确原文，一步重做恢复输入，重开保存一致。`android-input-result.json`、`android-input-history.json`。 |
| 原生拼音候选 | 用户输入拼音但未选字时主缓冲和文件均不变化；原生截图记录候选，选定“组字中”后可信 input 与失焦写回。`android-composition-pending.json`、`android-composition-native.png`、`android-composition-committed.json`。OEM 候选阶段不向 WebView 派发 composition，不虚构 DOM 事件证据。 |
| 横竖屏、长浮动 | 用户真实旋转到 823 × 363，长浮动中段替身存在、原文不变；转回 363 × 823 后发现并修复瞬态类循环，连续采样稳定，用户确认“已经稳定”。`android-landscape.json`、`android-jitter-fixed.json`。 |
| 滚动、pointercancel、原文守恒 | 手机可信 touch 事件和 ADB 注入原生触摸均记录到 pointercancel；实际页面可滚，日志中原文始终不变。修复后视频节点与尺寸稳定：`android-video-scroll-fixed.json`。 |
| 最终手指滑动与长按菜单 | 用户确认“滑动稳定，长按有菜单”。原生长按再次捕获可见图片菜单，含图注、环绕、添加文字、移出等入口；35 次 pointercancel 的 touch 日志原文不变。`android-touch-menu.json`／PNG、`android-touch-after-fix.json`。 |
| 视频播放 | 原生点击实际播放器的播放按钮，paused=false、currentTime=1.536531、readyState=4，尺寸与原文保持；`android-video-playback.json`。 |
| 高亮设置与触摸光标 | 开关前后矩形完全一致；关闭后原生点击左栏时高亮，键盘收起并点击块外后透明，输入原文不变；结束恢复并保存默认开启。`android-highlight-off.json`、`android-highlight-focused.json`、`android-highlight-outside.json`、`android-highlight-restored.json`。 |
| 最终前后台恢复 | 原生 Home 后重新打开同一 Activity，记录真实 hidden／visible；30 个 80ms 样本 epoch=0、scroll=2643.851806、替身=1、隐藏测量容器=0，缓冲与文件原文一致。`android-background-before.json`、`android-background-after.json`／PNG。 |

W09 已获得 Android 能力基线与实际阻断项修复；iOS 仍待设备。W10 已有中文输入和生命周期原型证据，但选区／复制粘贴、可见完成／取消入口、更多窄屏及宽表格等矩阵尚未完整覆盖；W11 还依赖 W03／W04，不宣称触摸移动、缩放、重排与系统中断全部完成。手机正式支持声明保持关闭。

## 收尾

最终原始报告为 `probes/android-final-report.json`。01／02 原文精确守恒；03 经 expected 原文校验后通过 `vault.process` 恢复，手机实际文件 SHA-256 与 194 字节原始备份一致；04 临时触摸笔记移入测试库回收站。实际手机 main.js 哈希与最终生产构建一致，高亮恢复开启。证据见 `android-restoration.json`。

Android 候选保留在独立测试库，停在“00 从这里开始”；日常库未部署。临时 USB 常亮已恢复为原值 0，18709 转发与任务自己的浏览器 daemon、慢资源服务已关闭。桌面专用测试库原插件四个文件与 community 配置按本轮备份恢复，哈希核对见 `w01-final-restoration.json`；真实 STUDY 窗口未关闭或重启。后续先按 W09 平台结论完善 W10，再按 W02–W04 的统一计划接入 W11；iOS 可用时另补真实设备矩阵。
