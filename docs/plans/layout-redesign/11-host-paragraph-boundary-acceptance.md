# W07 宿主段落分块验收

日期：2026-10-08。基线 `7fcd086`；分支 `codex/host-paragraph-boundaries`。**W07 实现与既定验收矩阵完成，待独立 PR 合入**。P2 完整生命周期、P3 规划器和组格式仍按原队列推进，版本仍为 0.7.1。

最终生产 `main.js` 与测试库安装文件 SHA-256：`be6f2a2265eec5250c2ef87f3fa7fff9d45b6d849499d4b0a857c93852ca486b`。以下最终验收数据均记录该构建；[10](10-host-paragraph-boundary-record.md) 保留首批历史数据。

## 边界与列表内部

Obsidian 1.14.4，Node 24.11.1，专用测试库 `vml-test-vault`。Worker 返回的类型和行范围与阅读渲染器在 24 种既有边界写法中逐块一致；[最终编辑器实测](probes/w07-acceptance-live-boundaries.json) 24/24 通过。内部接口缺失时继续使用原有推断。缓冲实例、版本变化、退出／关闭和迟到结果的保护由单元测试覆盖；渲染代码不改笔记。

顶层分块不含列表内部结构，内部继续按项文字起点与缩进判断。几何复核补齐了**列表内引用紧接缩进代码**的底部间距；另修正浮动锚点旁的代码、公式、HTML／`%%` 注释和 frontmatter 被当作正文补间距的情况，增加了回归测试。

[列表与元素几何、实际 CSS](probes/w07-acceptance-content-geometry-metrics.json) 覆盖全部 24 种写法，双方正文宽度均约 678px。段落间隔行实际高约 15.998px（CSS `--p-spacing: 16px`），多余空行高为 0，代码内部空行保持原生高度。列表项里的普通段落、缩进代码、引用、围栏、公式和注释分别核对。

这里验证的是块边界、间隔策略及其实际呈现，不承诺原生元素的字形顶端逐像素一致。已有原生差异有实际 CSS 依据：编辑器列表行带 `--list-spacing: 0.075em` 的约 1.2px 内边距；标题上方的样式不同；代码行的字号、围栏和 `pre` 内边距不同；HTML 注释在编辑器占行，在阅读视图不显示。这些自身高度由 Obsidian 负责，按 DESIGN.md 4.3 的口径与插件的分块／间距分开记录。

## 真实结构编辑与端到端成本

[真实输入脚本](probes/w07-final-structural-input.js.txt) 用 DevTools 协议 `Input.insertText`、真实 Enter／Delete／Backspace 执行 7 种修改，每种在真实笔记规模和 1 万行规模各重复 5 次，共 [70 次](probes/w07-acceptance-structural-input.json)。包括引用、列表内引用、嵌套缩进、增删空行和围栏。[汇总](probes/w07-acceptance-structural-summary.json)：

| 数据 | 真实笔记规模 p50／p95 | 1 万行规模 p50／p95 |
| --- | --- | --- |
| 真实结构输入到装饰安装后测量 | 92.5／96.1ms | 169.8／172.9ms |
| 整缓冲更新到装饰安装后测量（各 20 次） | 108.3／111.7ms | 232.4／282.8ms |
| Worker 往返（整缓冲样本） | 4.2／12.8ms | 106.9／155.8ms |
| 编码 p95 | 0.2ms | 0.8ms |
| 装饰更新 p95 | 0.8ms | 2.2ms |

[整缓冲性能记录](probes/w07-acceptance-performance.json) 包含验证、装饰和测量等待；端到端值还包含 80ms 防抖及同步快照。100 次间隔 20ms 的输入只发起一次 Worker 请求。

等待宿主结果时使用当前文本的推断，不平移旧结构边界。在“引用后代码”和“删除围栏”中，新结果到达时额外补一次约 16px 间距；列表内引用后代码为约 14.8px（16px 替换原生 1.2px 内边距）。其余场景额外位移为 0；最大更新延迟约 200.6ms，没有来回振荡。这是保留异步解析的实际行为，不能描述为编辑时零位移。焦点仿真、调试器连接均按原状态释放。

## 冷启动与真实全库重建索引

用一个临时测试插件在布局就绪时观察原生 `workQueue` 和 `work`，主插件的构建文件保持原样。

- [缓存完整的进程冷启动](probes/w07-final-cold-cached-final-startup.json)：队列等待约 0.6ms，整个请求约 9.8ms。
- [原生全库重建索引](probes/w07-final-full-reindex-final-startup.json)：执行 Obsidian 设置页同样的 `metadataCache.clear()` → 页面重载；43 个原生索引任务，其中含 20 篇各 1 万行、内容不同的临时负载笔记。请求排队约 2370.1ms，最终完成且索引任务降为 0。此项实际经过全库索引，独立于此前的人工排队样本。

顺序队列繁忙时解析结果会迟到；当前缓冲的版本校验与输入合并继续适用，编辑本身不等待 Worker。此记录不是所有规模库的索引延迟上限。

## 四篇笔记的三视图回归

- [屏幕结果](probes/w07-acceptance-final-678-current-surfaces.json)及[基线对比](probes/w07-acceptance-final-surface-comparison.json)：四篇笔记各 6／9／4／5 个布局块，两种视图共 48 次观测，正文实测宽度均约 678px。实时预览新旧宽高／位置差小于 0.001px；阅读视图最大约 0.122px。所有块完整观察到。
- 探针固定实际 `.cm-content` 宽度，避免窄窗格下 `.cm-sizer` 被 flex 缩窄；遍历终点随 CodeMirror 实测高度更新，覆盖初始估计高度之外的末尾。最终截图期间把专用测试窗口临时设为工作区尺寸，结束恢复原窗口边界。早期窄宽度／不完整扫描结果不用于结论。
- 四篇完整文本的新旧间距列表逐项相同；旧屏幕扫描少观察到 `wrap-test.md` 最后 20 个间距行，属于观察覆盖差，不是分块变化。
- [原生 PDF 导出](probes/w07-final-acceptance-pdf.json) 采用 Letter、默认页边距、相同 Microsoft YaHei UI 字体，实际走 Obsidian 的打印后处理及 `print-to-pdf` IPC，仅定向保存并关闭自动打开。布局数和图片就绪状态均核对。
- [PDF 对照](probes/w07-acceptance-pdf-comparison.json)：15／10／3／2 页，共 30 页；与干净基线导出的逐行文字／图片坐标和每页像素全部相同，代表性页面已渲染检查。完整 PDF 保存在 `dist/w07-final-pdfs/`，JSON 记录 SHA-256、文件尺寸和导出参数。导出设置的原始文件字节恢复并核对。

## 检查、恢复与范围

`npm run check` 的类型检查、官方审核 lint 和 354 项测试通过；生产构建与 `git diff --check` 通过。`dev:errors` 无错误。滚动探针仍见两份构建都有的 `Measure loop restarted more than 5 times` 警告，完整滚动生命周期属于 W01，不据本任务宣称其完成。

所有实测仅在专用库的自有标签页进行，原有 Markdown 哈希均不变。[20 篇索引负载笔记](probes/w07-final-index-cleanup-final.json)恢复创建时内容、核对哈希后移入系统回收站；其他临时笔记也按同样规则处理。临时采样插件停用，其[目录已回收](probes/w07-final-helper-recovery-final.json)，启用列表恢复原始字节。最后只保留主插件，库内没有 `W07` 临时笔记；测试库安装构建与源码生产构建相同。
