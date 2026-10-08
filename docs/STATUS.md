# 项目进度与验证记录

更新日期：2026-10-09。本机 `origin/main` 基线：`ce4124a`；本轮实现、文档与验收证据本地提交至 `codex/android-layout-stability`，尚未合并或发布。发布记录：[0.7.1](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/tag/0.7.1)（2026-10-05），公开状态和下载附件以 Release 页面为准。插件已在 Obsidian 社区目录中。

## 当前进度

- **视频尺寸与焦点后续（2026-10-09，本地）**：尺寸写回保留播放器，移动端布局操作不再主动聚焦正文；原生视频控件隔离编辑器点击处理，输入栏显隐不触发重画。407 项检查、最新平板播放／暂停／进度跳转及聚焦／未聚焦缩放、桌面输入回归通过，用户原页手指复核回复“没问题了”，见 [23](plans/layout-redesign/23-video-resize-player-preservation.md)、[24](plans/layout-redesign/24-mobile-video-controls-focus.md)。用户自行移动／调整后的笔记已保留，临时调试常亮及转发已恢复。

- **移动端角落补修（2026-10-09，本地）**：右下角缩放按钮完整移入框内并扩大为 44px，周围设置输入禁区，拦截缩放结束的关联误点击；403 项历史检查与真机正反例／取消／镜像角落证据见 [22](plans/layout-redesign/22-mobile-corner-input-guard.md)。最新构建的视频角落手指缩放已随 [24](plans/layout-redesign/24-mobile-video-controls-focus.md) 复核通过，其他专项手感不扩大为全部验收。

- **2026-10-09 平板续测与触摸修复（本地）**：华为 11.5S 原生中文输入、复制粘贴、历史、完成／放弃按钮和宽表格自滚动已有证据（[20](plans/layout-redesign/20-tablet-acceptance.md)）。普通点击源码误触、布局横向区域的侧栏冲突、顶部把手裁切及阅读切换空白已修复，398 项检查、生产构建、平板原生 CDP 触摸与桌面输入回归通过（[21](plans/layout-redesign/21-mobile-touch-interaction-fixes.md)）。实际手指复核和剩余平板矩阵保留；正式手机支持、W02 几何与 W11 统一规划器尚未完成。

- **0.7.1（已发布）**：0.7.0 的布局基础（快照、运行期身份、写入保护、每窗格同步与测量缓存，[PR #12](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/12)）之上，修复审查中发现的交互缺陷（[#14](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/14)），包括文字栏草稿保留、拖动不重画全部布局、合并与移出布局的设置保护。详见 [CHANGELOG](../CHANGELOG.md)。
- **`main` 上未发布的改动**：
  - [#16](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/16)：双击列宽分隔线恢复默认列宽；拖外框右边时单图大小不变。
  - [#17](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/17)：实时预览里环绕布局的替身可以操作、不再撑高列表行；整块拖动可以落进连续空行，越过先写的浮动时不再被压低；打开笔记不再显示第一个块的源码。
  - [#18](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/18)：PDF 中浮动和它环绕的正文一起换页，表格可缩到浮动旁；含布局块的笔记里，实时预览按阅读视图的段落间距画空行。三种视图的对比方法、结果和剩余差异见 [DESIGN.md 4.3](DESIGN.md#43-三种视图的排版一致)。
  - [#20](https://github.com/Yi-luo-hua/obsidian-adjustable-media/pull/20)：W07 已完成，实时预览用宿主对当前编辑缓冲的顶层分块决定段落间距；包含 Setext H1 与引用定义间距修复。最终检查通过 369 项测试、生产构建与修复提交 CI，新增 15 个宿主场景通过；完整矩阵与定向修复分别见 [11](plans/layout-redesign/11-host-paragraph-boundary-acceptance.md)、[12](plans/layout-redesign/12-paragraph-spacing-review-fixes.md)。
- **布局改进路线（R1／R2）与任务队列**：见 [09 进度与任务队列](plans/layout-redesign/09-progress-and-next-steps.md)。W07 已合入；W08“保持布局块边框高亮”已本地实现与验收，默认开启（[14](plans/layout-redesign/14-highlight-execution-record.md)）。W09 Android 真机基线通过、iOS 按用户要求暂缓；W01 Windows 已列门槛与最终生产对照通过，379 项检查通过（[18](plans/layout-redesign/18-android-and-w01-acceptance.md)）。W02 源码候选与 W10 移动输入按钮已本地实现，平板续测已恢复，当前证据与剩余矩阵见 [20](plans/layout-redesign/20-tablet-acceptance.md)、[21](plans/layout-redesign/21-mobile-touch-interaction-fixes.md)。候选几何与 R1 保留，P3、并列组尚未实施，完整 W10／W11 尚未验收。格式仍为 V2，不迁移旧笔记。

最新本地检查为 407 项；398／403／406 等数字属于各批次历史记录。当前验收范围、剩余项目和产物保留规则见 [25 文档与产物整理](plans/layout-redesign/25-documentation-and-artifact-cleanup.md)。

## 已知限制

- 阅读视图第一次虚拟滚动仍可能偶发 24–48px 或约 4–5px 的跳动，复现条件及尝试见 [DESIGN.md 4.1](DESIGN.md#41-文字环绕)。`wrap-test.md` 首次向上滚动的约 31px 位移与首次公式渲染的高度变化一致，没有做禁用插件的对照实验。
- 实时预览与阅读视图仍有少量间距差异：标题上方、H1 下方，以及代码、表格、公式块本身的高度；编辑器偶尔早一个词换行（`white-space: break-spaces`）。顶层块边界已采用宿主解析；等待／失败退路和列表内部仍用推断规则，旧特例与浮动补偿未完整清理。已测结构性编辑可能在宿主结果到达时校正一次约 16px，索引繁忙时结果会延迟。详见 [DESIGN.md 4.3](DESIGN.md#43-三种视图的排版一致) 与 [W07 验收](plans/layout-redesign/11-host-paragraph-boundary-acceptance.md)。
- PDF 的英文字体：没有设置文字字体时，Obsidian 导出用 Arial，屏幕用系统字体，断行会不同；在「外观 → 文字字体」里设置即可统一（见 [FAQ](FAQ.md)）。
- 链接建议不支持 `^` 块引用和 `[[##` 全库标题；目标已有别名或尺寸后缀时不补全，避免破坏后缀。
- 部分快捷键、设置、阅读视图高度和 PDF 导出依赖 Obsidian 内部接口，读取失败会回退。声明的最低版本是 1.5.0；桌面实测覆盖 Obsidian 1.13.7 与 1.14.4（Windows），移动候选已列场景覆盖 1.12.7（华为 nova 12／11.5S）。最低版本、其他版本、第三方主题和平台没有全覆盖。
- 当前插件声明仅桌面端；华为 nova 12／Obsidian 1.12.7 的 Android 基线与华为 11.5S／Obsidian 1.12.7 的已列平板场景已有证据。最新触摸修复尚未在 nova 12 重跑，全屏／分屏往返、平板前后台及全屏宿主多窗格等剩余矩阵保留；iOS 按用户要求暂缓。手机候选验证与正式支持声明分别按 W09–W11 的门槛推进。
- 发布按 [RELEASE.md](RELEASE.md) 执行检查、标签、草稿核验和发布流程。

## 历史验证记录

以下保留当时的日期和版本，不作为当前版本的完整验收证明。布局基础（0.7.0）的批次证据见 [07](plans/layout-redesign/07-execution-record.md)、[08](plans/layout-redesign/08-pane-foundation-record.md)；0.4.0 之后的滚动实测见 [SCROLL_VALIDATION.md](SCROLL_VALIDATION.md)；GPT-2 笔记的三视图对比（2026-09-22）见 [GPT2_VALIDATION.md](GPT2_VALIDATION.md)。

0.4.0 的验证（2026-09-17，Obsidian 1.13.7，测试库 `vml-test-vault`）：`npm run check` 通过 186 项测试；在 `text-block-test.md` 和 GPT-2 论文前 5 页的复刻笔记里，用 DevTools 协议实测了真实点击、输入、右键菜单和文字设置弹窗，阅读视图与实时预览逐屏对照一致；Obsidian 重启后 MathJax 未加载时打开有编号公式的笔记正常；会改动的测试笔记按备份恢复并核对了哈希。已知限制见 [DESIGN.md 第 1.4 节](DESIGN.md#14-编号与交叉引用)。

0.3.1 修复阅读视图首次添加和移除最后一个环绕布局时旧段落的类同步，并减少 CSS 审核警告。独立复核的双窗格 14 项生命周期检查通过，包含实时预览往返和切换笔记；原有笔记哈希未变。渲染器不可用时的回退仅经静态审查。

早期开发阶段（Windows、Node 24、Obsidian 1.13.7，专用测试库 `vml-test-vault`）：

| 检查 | 结果 |
| --- | --- |
| 从锁文件安装依赖 `npm ci` | 成功，安装时审计报告 0 个漏洞 |
| `npm run check` | 类型检查、官方插件 lint 和 159 项测试通过 |
| `npm run release` | 生产构建及三处版本校验通过，生成三个发布文件 |
| 文字栏真实输入 | 输入写回、Alt+B 自定义加粗、旧 Ctrl+B 停用、引用缩进/反缩进、任务切换、括号配对、链接建议和补全、别名保护通过 |
| 输入安全与显示 | 公式/图片显示、中文组字期间不写入、确定后写入、非法块结构拒写、媒体及另一栏原文保留、Esc 退出通过 |
| 阅读视图折叠/展开 | 替身数量 5 → 0 → 5，无编辑手柄 |
| 首次从末尾向上、再向下滚动 | `wrap-multi.md` 两个方向均零检测跳动；`wrap-test.md` 首次向上一次约 31px，下滚零检测跳动 |
| 窄窗格 | 397px 内容宽度下打开多浮动测试笔记、滚到底再返回，段高度均为有限值，无编辑手柄 |
| 插件重新加载 | 成功，无捕获错误 |

滚动检查以 40px 步长比较同一个仍在页面中的段落位置，位移大于 2px 记为一次；这是该测试场景的结果，不代表所有滚动路径均无跳动。测试只使用专用笔记，结束后恢复并以 SHA-256 核对原笔记及快捷键文件。
