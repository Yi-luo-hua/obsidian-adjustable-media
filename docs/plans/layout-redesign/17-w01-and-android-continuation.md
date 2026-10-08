# W01 补充与 Android 真机首轮（暂停时快照）

已于同日恢复测试，原先的待处理问题与剩余门槛结论见 [18 续测验收](18-android-and-w01-acceptance.md)。以下保留暂停时的构建与观察，不作为当前状态。

日期：2026-10-08。用户要求在文字输入测试前暂停，随后继续；iPhone 13 Pro Max 当前不可测试，先处理 Android。本次未提交、合并或发布。

## W01 补充证据

- 在测试库主窗口真正关闭／重开，启动 companion 在候选插件加载前确认 `MathJax` 不存在。首次公式渲染完成，实时预览和阅读均收敛。
- 使用实际延迟 1700ms 的字体 HTTP 响应。发现字体 loading 期间旧测量仍可能 settled；现在监听 FontFaceSet 的 loading、loadingdone、loadingerror，下载期间 measuring，完成后两窗格重新收敛。
- 两个真实 CodeMirror 文档经原生 dispatch 保留不同内容：只暂停宿主的 requestSave 和目标测试文件的 quick-preview 广播，不修改 getValue 或插件读源接口。A、B 与磁盘分别核对，插件零强制 setViewData。恢复后两窗格收敛。
- W01 当前有效测量范围的诊断基线，单 guard／环境／缓冲长度／视口最多观察到 8 次有效 read。冻结当前 V2 每个观测范围 16 轮上限；阅读按每个 section、宽度记录复测请求。新内容、环境、有效资源或新观测范围才重新建立预算。停止时保持 measuring，不复用旧 ready。这个上限不代替 W02 候选预算或手机性能结论。
- 真实 guard 连续 40 次读调用：16 轮后拒绝继续，并撤回先前 settled；有效资源事件后恢复。对真实 renderer section 注入交替错误 height／computed：40 次求解最多 16 次复测请求，保持 pending，环境失效后恢复。这里的故障注入是停止规则证据，不是正常宿主性能样本。
- 稳定 2.2 秒：零新源／环境请求、零布局 effect、零 wrap read；原测试笔记哈希全部保持。
- 证据：`probes/w01-remaining-gates.json`，本次最终 passed；失败历史保存在 `w01-remaining-gates-before-font-fix.json`。
- 最近完整自动检查 377 项通过，类型／lint／生产构建通过。这之后新增手机诊断脚本及诊断构建插桩仍需在恢复工作时再跑 check；新增生产构建的完整生产 host 回归也待继续，不能把诊断构建通过当作这一项完成。
- 生产 main.js SHA-256：`98cfb112bc02432010d7190b107a10693ac4fd6716b6facf892310b23d87226e`；最终桌面诊断：`fa4f7b7324620d8d82a3e16a7ee386acecabe0836649ce083f677c92d2fe2d09`。

## Android 真机

- 用户设备：华为 nova 12；ADB 实际型号 ADA_AL00U、Android 基础版本 12／SDK 31；Obsidian 1.12.7。真实 CSS 视口 363 × 823，DPR 3.375。
- 使用独立 `/sdcard/Documents/adjustable-media-mobile-test`，没有部署到日常库；候选 manifest 设 `isDesktopOnly: false`，正式仓库 manifest 仍 true。
- 工具放项目 `dist/mobile-tools/`：Google Platform Tools 37.0.1，Google 签名有效，下载 zip SHA-256 `45f4d63113e895ebde0c90f194099a4676b6ac653bd28d54314a9e022bbc1a99`。
- 此手机 ADB 接口被 Windows 绑定 WinUSB，但缺少 DeviceInterfaceGUIDs。华为官方 HiSuite 14.0.0.380 的签名／官网 SHA-256 已核对；只从其 INF 读出 ADB GUID，未安装整套 HiSuite 或 USB filter 驱动。用户同意 Windows 管理员弹窗后，给这一 ADB 接口补登记并成功连通。原值、精确设备路径和回退脚本在 `dist/mobile-tools/adb-registration.json` 与 `restore-adb-interface.ps1`；不触及 MTP/HDB 接口。
- browser-cdp-harness 与项目 `scripts/mobile-cdp.mjs` 连接真实 Obsidian WebView，核对测试库和插件身份；不能把这份证据当作 iOS 或手指／手机中文输入法验收。
- 已验证生产 bundle 启停、图片／视频／公式的实时预览、当前精确缓冲的 computeMetadataAsync、该接口 missing／rejected 的退路；捕获期间无未处理 JS 异常，只读 fixture 原文守恒。
- 两个待解决的实际观察：首次切入阅读时可能没有插件布局，显式原生 rerender 后恢复；长浮动锚点离屏时，环境 epoch 再变化后 guard 的尺寸缓存为空、无替身、保持 measuring。分别保留 `android-baseline.json`、`android-reading.png`、`android-middle-diagnostic.json`／PNG，不将这两项记为通过。首次 body39 场景实际已越过浮动末尾，另存 `android-baseline-body39.json`，不能作为替身失败证据。
- 真机软键盘／中文组字、触摸仲裁、取消零写入、旋转和前后台尚未执行。手机能力与适配仍未验收。

## 暂停与恢复点

用户在输入文字测试前要使用电脑和手机，停止进一步测试。慢资源服务器已关闭，browser-harness daemon 停止；USB 调试连接在清理期间已断开，手机未能通过 CDP 切入“03 文字输入”，因此不宣称已停在该页。磁盘候选 main.js 已恢复生产文件，手机当前内存可能仍是诊断构建，需要继续时重新禁用／启用并核对哈希。

桌面测试库原 main.js、styles.css、manifest.json、data.json 全部按本轮 `dist/w01-gates-backup/` 恢复、哈希一致；startup companion 已禁用，community-plugins.json 恢复。真实 STUDY 窗口没有关闭／重启。

继续时先重新连接并解锁华为、恢复 WebView forward、核对独立测试库和加载构建；解决阅读首次呈现与环境变更后的离屏浮动，再停在“03 文字输入”请用户执行真实中文输入法步骤。随后做触摸／旋转／前后台与生产桌面回归，更新 W01／W09 平台结论。iOS 继续待设备可用。
