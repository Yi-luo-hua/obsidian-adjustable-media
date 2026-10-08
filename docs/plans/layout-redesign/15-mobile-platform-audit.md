# W09 手机平台源码审计与待测矩阵

日期：2026-10-08。以下源码审计是 W09 准备记录；同日已补 Android 真机基线和必要修复，最新证据见 [18](18-android-and-w01-acceptance.md)。iOS 按用户要求暂缓，完整手机适配尚未完成。正式 `manifest.json` 保留 `isDesktopOnly: true`。

## 源码能力与风险

| 范围 | 当前代码 | 真机需核验的行为 |
| --- | --- | --- |
| 桌面专用模块 | `src/`、`main.ts` 未直接导入 Node、`fs`、`electron`；构建将宿主模块外置。 | 能加载生产 bundle 及宿主提供的 Obsidian／CodeMirror 模块；外置本身不证明移动端可用。 |
| 文件与附件 | `media.ts` 使用 metadataCache、Vault 资源 URL；写入统一经过 `writeBack.ts`。 | Android／iOS 本地附件 URL、相对路径、视频播放、保存重开及一步撤销。 |
| 段落 Worker | `obsidianInternals.ts` 的 `computeMetadataAsync` 是可选内部接口；失败返回 null，使用推断退路。 | 缺失、拒绝及慢返回；当前缓冲与宿主分块是否匹配，前后台切换后的迟到结果是否丢弃。 |
| 阅读高度 | 内部 renderer 的 sections、sizer 与 queueRender 集中适配。 | API 形状、滚动与折叠、资源晚加载、旋转和软键盘后的真实高度；缺接口时的呈现范围。 |
| 每窗格环境 | `viewEnvironment.ts` 使用 ownerDocument／window、ResizeObserver、MutationObserver、FontFaceSet 与资源事件。 | WebView 中字体事件、旋转、安全区、visual viewport、前后台暂停后的恢复。 |
| 文字输入 | 独立 CodeMirror 文字栏编辑器；组字完成前不写入，Esc 是桌面退出入口之一。 | 点击、软键盘、中文组字、选区／粘贴、完成／取消可见入口与键盘遮挡。 |
| 高亮开关 | W08 的“保持布局块边框高亮”默认开启；关闭后按 activeEditor、DOM 焦点与块身份显示。 | 无物理键盘时的光标／焦点、系统返回、键盘收起、后台恢复；沿用同一块归属语义。 |
| 缩放／移动 | 手柄具有 `touch-action: none`；部分手柄在 hover／活动状态才显示，pointerdown 立即开始操作。 | 不依赖 hover 的可见入口；手指滚动与拖动启动阈值，边缘滚动、系统取消及多指干扰。 |
| 媒体重排 | `interactions.ts` 的媒体 pointerdown 会 preventDefault 并进入拖动；`trackPointer` 处理 pointercancel、lost capture、Esc 和原生拖动。 | 触摸滚动是否被抢占，系统返回／应用后台如何取消；触摸捕获不等于完整触摸操作验收。 |
| 菜单与看图 | 图片菜单依赖 contextmenu；恢复列宽、看图缩放含 dblclick，看图另用 wheel／方向键。 | 长按、可见菜单／缩放按钮、返回和关闭入口；不把桌面手势直接当手机方案。 |
| PDF | 导出在独立 `.print` 容器内，使用宿主导出流程。 | 两个平台是否提供等效导出入口；未验证前不承诺手机 PDF 能力。 |

## 按平台记录

| 平台 | 设备／系统／Obsidian | 安装／启停／保存重开 | 图片／视频／内部接口 | 触摸／组字／返回 | 状态 |
| --- | --- | --- | --- | --- | --- |
| Android | 华为 nova 12／ADA_AL00U，Android 12／SDK 31，Obsidian 1.12.7 | 生产候选启停、输入保存重开、一步撤销／重做通过 | 图片／视频播放／公式、Worker 精确缓冲及 missing／rejected 退路通过 | 手机中文输入法候选与选定写回、横竖屏、滚动取消与长按菜单已有证据 | 基线通过；完整 W10／W11 保留 |
| iOS | iPhone 13 Pro Max；系统／宿主待查 | 未执行 | 未执行 | 未执行 | 用户要求暂缓 |
| Android 平板 | 华为 11.5S／TGR-W10，HarmonyOS 4.2.0／Android 12、SDK 31，Obsidian 1.12.7 | 已加载独立库生产候选，中文输入保存重开、撤销／重做通过 | 图片／视频元数据／公式、Worker 退路与窄屏阅读切换已有证据 | 原生候选／粘贴、系统旋转／分屏、完成／草稿取消及侧栏边界通过已列检查；触摸修复待人工手指复核 | 续测已恢复；见 [20](20-tablet-acceptance.md)、[21](21-mobile-touch-interaction-fixes.md)，剩余全屏往返／多窗格与完整 W10／W11 保留 |

ADB 工具已在项目 `dist/mobile-tools/` 配置，并连通真实 Android WebView；接口登记与测试库边界见 [17](17-w01-and-android-continuation.md)。没有用桌面模拟替代上述 Android 手指与原生输入法证据；iOS 继续保留待验收。

## 下一步

1. 使用独立手机测试库与候选构建，记录设备、系统、宿主版本、源码和 bundle 哈希。候选 manifest 可暂设非桌面限定，正式 manifest 保持不变。
2. 先验证启停、V2 打开／编辑／保存／重开和内部接口退路，再做触摸／软键盘原型。保留原笔记和设置的备份、结束核对哈希。
3. 实测滚动、点击、长按、移动阈值及取消后，再冻结启动规则。任何改写使用已有事务边界；W11 接入 W03／W04 的统一计划。
4. 真机暂不可用时，W09 保持待验收，继续不依赖手机证据的 W01 桌面生命周期。W10／W11 保留各自的进入门槛。
