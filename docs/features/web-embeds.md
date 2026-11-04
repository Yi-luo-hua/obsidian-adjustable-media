# 外链网页嵌入布局

2026-11-05，针对 [Issue #38](https://github.com/Yi-luo-hua/obsidian-adjustable-media/issues/38) 开发，尚未公开发布。当前公开版仍为 0.9.3。

## 使用

支持完整的 HTTP／HTTPS `<iframe …></iframe>`（可跨多行），以及 Obsidian 原生支持的 YouTube、Twitter／X 状态链接 `![](URL)` 嵌入。服务可用性沿用 Obsidian 与网站本身；普通超链接、笔记嵌入、任意第三方插件卡片不会自动成为网页媒体。

- 选中完整嵌入，执行既有「把选中的内容包成布局块」命令；纯媒体选区每行最多四项，可与图片、视频、Mermaid、Excalidraw 混排。
- 只取用顶层正文中的网页嵌入；属于列表的无缩进续行也不会被单独包装、自动转换或拖走。整段选中列表时保留为文字布局，列表和其中的嵌入原样留在一起。
- 块外原生 iframe 右上角有独立按钮：点击／右键打开「包成布局块」菜单；已有布局时，从按钮拖入同笔记、同窗格的布局。按钮不插入或替换 CodeMirror 的原生控件。
- 布局里的专用把手负责移动、换位和右键菜单；网页内部保留点击、滚动和播放器操作。底部链接可以打开原地址。
- 列间把手调整并排宽度，单项侧边调整单项宽度，行底部调整共同行高。每个网页自己的底边调整独立高度（80～900px）；双击该把手或使用「重置独立网页高度」菜单恢复继承。
- 外框支持整体调整、移动和浮动环绕；网页也可放在文字栏旁。阅读视图应用相同布局，不显示编辑把手。

可复制的 [真实服务样例](../examples/WebEmbeds.md) 包含 YouTube、Spotify 与 OpenStreetMap。

想直接体验完整排版，可以复制 [《把世界放进一页》](../examples/把世界放进一页.md)：城市地图、月球影像、图文布局、页边环绕和可操作的拖入练习，无额外 CSS 或本地素材依赖。

## 格式与边界

使用既有 V3 单块格式，`rows[].items` 描述逻辑行，`rows[].heights` 为与媒体项对应的高度数组：数字表示网页独立高度，`null` 表示继承。优先级为独立高度 → 显式行高 → iframe 原始数字高度 → 220px。网页默认等分列宽；原有数字宽度用于单项初始宽度。

```markdown
<!-- vml {"v":3,"kind":"media","rows":[{"items":2,"heights":[260,350]}]} -->
![](https://www.youtube.com/watch?v=NnTvZWp5Q7o)
<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=-0.16%2C51.49%2C-0.10%2C51.52&amp;layer=mapnik" title="London map" width="425" height="350"></iframe>

<!-- /vml -->
```

嵌入源码、属性、参数、URL 编码与内部换行原样保存。尺寸只写开始注释；搬运完整项时独立高度随项移动。CRLF、块外正文和代码／注释中的样例不改写；部分选中多行 iframe 时拒绝包装。

重排生成源码时，在 iframe 项后增加分隔空行，避免原生 HTML 段吞入后续 Markdown。手写块中已经被吞入的结束注释、连续布局和尾随正文，在阅读视图的内存副本中拆分，不改笔记。

iframe 通过允许的属性创建 DOM，不安装原始 HTML、事件属性、`style` 或 `srcdoc`。保留 `allow`、`allowfullscreen`、`sandbox`、`referrerpolicy`、`loading` 等属性；未指定 sandbox 时使用 Obsidian 原生 HTML iframe 的默认权限。原始宽高留在笔记，显示尺寸由布局控制。Markdown 网页嵌入交给 `MarkdownRenderer`，沿用宿主的 YouTube 中转页。

缩放预览及保存复用 iframe；指针操作期间暂时屏蔽 iframe 命中，结束／取消恢复。移动、切换视图或宿主虚拟化收起后仍可能重建，不承诺跨重建保留播放进度。PDF 网页媒体输出可点击链接，不请求截图或等待播放器。显式文字块仍由宿主渲染，不自动转成媒体项。

网站的嵌入、地区、登录和网络限制仍然生效。旧版插件可能显示普通文本或不同排版，不应使用旧版编辑此类新布局；不自动迁移旧块。

## 样例来源

- [Obsidian：Embed web pages](https://obsidian.md/help/Editing%2Band%2Bformatting/Embed%2Bweb%2Bpages)：iframe、YouTube 和 Twitter 的原生语法。
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)：官方示例视频 `M7lc1UVf-VE`。
- [Spotify：Creating an Embed](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed)：官方示例曲目 `0Lr4kGOYn9l83EjuK6cZFQ` 及分享 iframe 结构。
- [OpenStreetMap：Export](https://wiki.openstreetmap.org/wiki/Export)：分享面板地图 iframe，测试使用伦敦范围。

## 验证

Windows 11／Obsidian 1.14.4（Electron 43.7.7、Chromium 150）／默认主题／Node 24.11.1，专用 `vml-test-vault`：

- 类型检查、lint（0 错误）、555 项 Node 测试与生产构建通过。覆盖解析、原文守恒、独立高度搬运、过期写入拒绝、重复 iframe 定位、HTML 段边界、列表归属、紧凑网页行高和打印链接。
- YouTube 原始 iframe、原生 Markdown 嵌入与 OpenStreetMap 实际加载。Spotify 页面加载完成，远程正文显示地区不可用提示，不将其记为音乐播放通过。
- Twitter 与 X 两种状态链接均由宿主生成相同的 Twitter 嵌入 iframe；未将远程推文内容或交互记为验收通过。
- 真实鼠标验证独立高度、列宽、预览零写入、保存后 iframe 实例保持、Esc 取消及尾随释放；块内换位、块外拖入、包装菜单与各自一步撤销。
- 同行两个相同 iframe 的原生控件均提供把手，实际拖动第二个时精确移除第二个源范围，并能一步撤销。
- Review 修复复测：100／152px 的纯网页行下拖 1px 后显示并保存为 153／153px，预览零写入、原 iframe 复用、一步撤销正常；Esc 取消恢复原高度和 CSS。列表续行拒绝单独包装且不显示拖入把手，完整列表可作为文字布局包装并一步撤销，普通独立网页的把手保留。
- 430px 窄窗格和 CDP 触摸仿真：两列各约 211px，调高、实例复用、一步撤销通过，不等同移动真机验收。
- 阅读模式无编辑把手或重复网页；紧接正文、连续两个布局的手写 HTML 边界样例正常，源文未变。
- PDF 链接回退通过渲染单元测试；完整原生 PDF 导出／分页、macOS、移动真机、弹出窗口、其他主题和其他 Obsidian 版本未复测。

临时笔记恢复原文并核对后清理，测试库原插件与窗格布局恢复。本次不创建公开 Release，也不自动回复或关闭 Issue。
