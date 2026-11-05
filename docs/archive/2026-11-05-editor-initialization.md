# 新文档打开时的 editor 初始化兼容修复

## 反馈与定位

用户反馈：空白库只启用 Adjustable Media 后无法新打开文档；启动时已经打开的文档可用。截图提示 `Failed to load workspace "摘要": Cannot read properties of undefined (reading 'editor')`。未取得反馈者的 Obsidian／插件版本与完整堆栈。

公开 0.9.3 与当前主线的实时预览状态初始化都会立即读取 `editorInfoField` 中的 `editor`。本机 Obsidian 1.15.0 的实际 getter 为 `get editor(){return this.editMode.editor}`；`info?.editor` 只能检查 info，不能保护 getter 内部尚未赋值的 editMode。文件来源回退还会遍历其他 Markdown 窗格并访问同一 getter。

本机正常新开文档没有直接复现用户故障。在宿主中用真实 MarkdownView 原型、未赋值的 editMode 和真实 CodeMirror 字段初始化时序构造该条件，旧读取方式产生与截图相同的 TypeError，修复后通过。已确认这一代码缺陷；缺少反馈者环境信息，尚不能确认其唯一根因或实际恢复情况。

## 修复

- `editor/editorInfo.ts` 集中读取宿主 editor getter，仅在这一次读取抛错时返回未就绪状态；后续事务重新读取，不缓存失败。
- 实时预览初始化、更新、部件与焦点检测使用相同入口。编辑器就绪后重新绑定精确来源和缓冲身份。
- 文件来源回退跳过尚未初始化的窗格，保留其他窗格与 Canvas 的精确归属。
- 不改变笔记格式或写回路径。

## 验证与交付边界

2026-11-05，Windows／Obsidian API 1.15.0（installer 1.14.4）／默认主题：

- 回归测试把安全读取暂时还原为直接 getter 读取，3 项用例出现同款 `reading 'editor'` 异常；恢复修复后通过。覆盖空白、普通、布局文档初始化与后续事务、编辑器就绪后来源恢复、另一个未就绪窗格和 Canvas 来源。
- `npm run check`：类型检查、lint（0 错误、184 条警告）和 558 项测试通过；`npm run build` 通过。
- 宿主内用真实 getter 构造未就绪条件：旧读取抛错，修复后 3 种文档均保持源码并恢复正确编辑器归属。
- 测试库实际打开 3 种临时笔记，连续两轮编辑／阅读切换，布局两种模式各显示 1 个；另开 3 个新标签页通过。卸载其他测试插件后，仅加载 Adjustable Media 再开三篇均通过，错误捕获为空。
- 临时笔记测后核对原文并移入测试库回收站；原有笔记哈希、原插件文件与设置核对恢复，原窗格恢复。

尚未在反馈者环境、旧版 Obsidian、移动设备、其他主题或完整重启流程复测。公开版本仍为 0.9.3；主线包含其他未发布功能，此修复未直接发布新版本。另以公开 0.9.3 标签源码叠加本修复准备手动安装测试包，不夹带主线网页嵌入功能。
