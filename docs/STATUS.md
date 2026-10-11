# 项目状态

更新：2026-10-12。当前工作树与恢复位置见 [WORKTREES](WORKTREES.md)，未完成任务见 [任务队列](plans/layout-redesign/09-progress-and-next-steps.md)。

## 版本与交付范围

- **公开版本：0.7.3**，桌面版，发布标签源码 `da4aea9`；公开附件和来源签名已核对，详见 [Release](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/tag/0.7.3)。
- **main：未发布的 0.8.0 候选**。已整合手动分栏、高亮、三视图／渲染修复、Android／iPhone／iPad 适配和 Mermaid 独立项；候选声明 `isDesktopOnly:false`，不批量迁移旧 V2 笔记。
- 原 main 完整保留为 `codex/main-before-080`。主目录检出 main，公开发布和版本标签仍待单独授权。材料与步骤见 [发布准备](releases/0.8.0-readiness.md)和[发布流程](RELEASE.md)。

## 已有工作与当前边界

| 工作线 | 状态 | 接下来 |
| --- | --- | --- |
| 手动文字分栏与边框高亮 | 已随 0.7.3／0.7.2 发布，main 保留 | 按实际变化验证，保持旧笔记原文 |
| 三视图、段落间距、渲染与播放器 | 本轮修复已进入 main，Windows 定向验证通过 | 随 0.8.0 发布；其他未验收范围继续单独记录 |
| Mermaid 与移动适配 | 已进入 main，用户修订的中英文说明和离线示例已打包 | 随 0.8.0 统一发布，保留设备与构建边界 |
| W02／W03 候选测量与规划 | 原型在独立工作树，33 个未提交文件保留 | 正式接入、完整约束与 ready 契约、峰值优化 |
| 拖动动画、并列组与 R1／R2 | 未完成，两项组 ADR 仍为 proposed | 按任务队列与依赖推进，不带入当前发布包 |

## 验证

- 发布代码基线 `740dcd6` 与主线调整 `25ed9d5`：本地／CI 的类型检查、lint、**465 项测试**及生产构建通过；主线调整只改文档，干净源码构建的三份附件与已准备的包逐字节一致。
- Windows／Obsidian 1.14.4：相关 Mermaid、布局交互与更新弹窗通过；中英文离线示例创建、重复创建不覆盖、实时预览／阅读视图的三张图表通过，原有测试笔记未改动。
- Android 平板 11.5S：新图表、缩放、滚动、旋转和独立图表正文长按／边缘拖入通过自动复测与用户确认。
- Android 手机、iPhone、iPad 的基础验收保留各自原构建结果；新增正文长按与边缘投放未在这些设备复测。iPhone／iPad 的独立报告和保存内容核对依用户要求跳过，设备细节与历史场景见 [移动记录](plans/layout-redesign/mobile-adaptation.md)。

## 已知限制与验收范围

- 主线调整、文档清理和自动检查不代表所有真机或三视角场景通过；本轮没有全量重跑 PDF 与历史矩阵。
- 阅读视图首次／快速虚拟滚动仍有有限场景跳动；宿主段落分块在等待／失败时和列表内部仍保留推断退路。
- 屏幕与 PDF 的字体、换行和分页存在原生差异；部分功能依赖宿主内部接口，最低声明版本不等于覆盖所有主题、版本和设备。
- 链接建议不支持 `^` 块引用或 `[[##` 全库标题。使用限制见 [FAQ](FAQ.md)，格式与写回规则见 [DESIGN](DESIGN.md)。

逐次提交、测试数量、设备构建和保存内容核对记录统一放在 [合流验收历史](archive/0.8.0-integration-and-validation.md)、[验收摘要](plans/layout-redesign/archive/branch-validation.md)与[历史索引](archive/README.md)，不重复作为当前待办。
