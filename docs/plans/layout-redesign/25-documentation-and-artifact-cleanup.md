# 文档对齐与产物整理

2026-10-09，按用户要求更新项目文档，清理已完成测试的无用产物。本机 `origin/main` 为 `ce4124a`；清理时本地增量位于 `codex/cursor-border-highlight`。随后按用户要求将本轮实现、测试、文档和验收证据本地提交至新分支 `codex/android-layout-stability`，未合并／发布。正式 manifest 仍为 `isDesktopOnly: true`，存储格式仍为 V2。

## 当前验收范围

| 范围 | 最新状态 | 记录 |
| --- | --- | --- |
| W07 | 已合入 main，未发布 | [11](11-host-paragraph-boundary-acceptance.md)、[12](12-paragraph-spacing-review-fixes.md) |
| W08 | 默认开启“保持布局块边框高亮”，本地验收通过 | [14](14-highlight-execution-record.md) |
| W01 | Windows 已列生命周期门槛通过，未宣称所有平台与 R1 通过 | [18](18-android-and-w01-acceptance.md) |
| W09／W10 Android 基线与平板输入 | nova 12 基线；11.5S 已列旋转、宽表格、中文候选、粘贴／历史及完成／放弃场景有证据 | [18](18-android-and-w01-acceptance.md)、[20](20-tablet-acceptance.md) |
| 现有 V2 触摸增量 | 源码误触、侧栏横向冲突、把手／输入禁区、阅读切换及视频焦点／缩放已修复；视频播放／暂停／右下角缩放手指复核通过 | [21](21-mobile-touch-interaction-fixes.md)–[24](24-mobile-video-controls-focus.md) |
| 最新自动验证 | 类型、官方 lint、407 项测试通过；最近生产构建 ff0e440，平板原生 CDP 与 Windows 七项输入回归通过 | [24](24-mobile-video-controls-focus.md)、[本次检查日志](probes/local-check-20261009.txt) |

最新 main.js SHA-256：`ff0e440cc258f2448feec85910fee7856f448e8a7f5b871b6b924360ad392c2a`；styles.css：`b2012bec744d6250b7fc336b247cc1c77f92deb8203c3294307cc7c8b1a5f914`。398／403／406 等数字和旧哈希属于各批次原记录，未改成最新数字，也未重跑全部历史矩阵。

## 仍需完成

- 平板窄屏／分屏／全屏往返、前后台／系统中断及全屏宿主多窗格矩阵；非视频专项的源码入口、侧栏、顶部把手和镜像角落手感，不能由视频复测代替。
- nova 12 上重跑 21–24 的最新触摸修复；之前的 Android 基线不证明新构建全部通过。
- iPhone 13 Pro Max 按用户要求暂缓，iOS 未验收。
- W02 几何／测量版本、提交与重开后的 ≤2px 对照及完整候选预算；Node 源码成本不等于宿主候选预算。
- W03／W04 统一规划与接入、W11 触摸接入及 R1 集成；并列组仍等待格式 ADR、原型与 P5 门槛。

完整进入／退出条件保持 [05](05-delivery-and-validation.md) 与 [09](09-progress-and-next-steps.md) 的要求。用户最后“没问题了”仅用于其实际播放／暂停／视频角落缩放步骤，不扩大为整个手机支持验收。

## 文档对齐

更新 STATUS、规划 README、09 任务队列和 13 的当前入口；19–23 保留历史批次并指向后续状态。移除当前视频“待手指复核”和调试“待清理”的陈旧状态，半屏阅读空布局改为已由 21 修复。暂停前 Windows 失败记录改指向历史文件，当前共用 `w10-input-actions.json` 明确属于 24 最新回归。

Unreleased 中的本地候选改动与已合并条目分别说明。当前发布版本／正式平台声明不因本地验收改变，未迁移或重写用户笔记。

## 可恢复清理

两轮合计 **341 个文件，132,193,819 字节，约 126.07 MiB**，已移入 Windows 回收站。它们包括未再引用的设备临时脚本／日志／截图／构建副本、已结束的 W07 Python 环境、华为安装程序与平台工具压缩包、旧发布包输出与 W01 诊断构建，以及失效的临时构建／恢复助手。

清理前核对绝对目标均在本仓库 dist 内，检查链接边界；暂存后逐文件核对 SHA-256，再送入回收站，确认原路径不存在且回收站项目匹配。未清空回收站，不把可恢复产物计为已永久释放的磁盘空间。

完整文件清单、原路径、大小、哈希及恢复映射见 [主清理记录](probes/artifact-cleanup-20261009.json)、[补充清理记录](probes/artifact-cleanup-extra-20261009.json)。恢复时先在 Windows 回收站还原对应 `.artifact-cleanup-20261009`／`.artifact-cleanup-extra-20261009` 文件夹，再按清单把内容移回 original 路径。

保留当前根目录生产 main.js、node_modules、ADB 可执行工具及驱动／注册恢复材料、全部正式 probes 证据、被文档引用的历史 PDF／截图／JSON／基线、原插件和输入 fixture 备份、历史发布校验材料；无关会话目录和源码改动保留。原生媒体代理诊断保存为 `tablet-video-host-delegates.json`，通用重载探针保存为 `mobile-plugin-reload.js.txt`。

两套本地测试库种子的 main.js／styles.css 和 build-info 哈希已与最新根目录产物同步，种子笔记未改；这不代表 nova 12 已部署新构建或增加设备验收。手机／平板上的独立库及用户手动移动／调整后的笔记未操作。以后继续测试按必要文件更新，避免整库复制覆盖设备上的手动内容。

上一轮设备调试已经停止观察器、恢复 USB 常亮为 0、移除 18710 转发；本次文档／清理未重新连接设备或操作宿主界面。
