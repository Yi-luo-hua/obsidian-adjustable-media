import { moment } from "obsidian";

import type { V2Block } from "../format/v2.ts";

// UI text follows Obsidian's language: Chinese for zh locales, English otherwise.
const MESSAGES = {
  guideTitle: { zh: "Adjustable Media 功能介绍", en: "Adjustable Media overview" },
  guideSubtitle: {
    zh: "为 Obsidian 带来无侵入、所见即所得的 Markdown 多媒体与文本自由排版能力。",
    en: "Non-destructive, what-you-see-is-what-you-get media and text layouts for Obsidian.",
  },
  guideLanguage: { zh: "语言", en: "Language" },
  guideCreate: { zh: "在库中创建示例笔记", en: "Create example note in vault" },
  guideCreateDesc: {
    zh: "在库中生成独立的示例笔记与离线素材，方便在实时预览模式下亲自上手体验拖拽调整。",
    en: "Creates a standalone note and offline media in your vault to try interactive layouts in Live Preview.",
  },
  exampleFolderName: { zh: "Adjustable Media 示例", en: "Adjustable Media examples" },
  settingUiLanguage: { zh: "界面语言", en: "Interface language" },
  settingUiLanguageDesc: {
    zh: "设置插件界面与菜单的显示语言；选择「跟随 Obsidian」将自动匹配应用语言。",
    en: "Display language for plugin menus, settings, and notices; \"Follow Obsidian\" matches your application locale.",
  },
  uiLanguageAuto: { zh: "跟随 Obsidian", en: "Follow Obsidian" },
  settingOpenGuide: { zh: "功能介绍", en: "Feature overview" },
  settingOpenGuideDesc: { zh: "重新查看插件的核心排版能力与快速上手指南。", en: "Reopen the feature overview and quick start guide." },
  settingOpenGuideBtn: { zh: "打开指南", en: "Open overview" },
  guideCreating: { zh: "正在创建…", en: "Creating…" },
  guideCreated: { zh: "示例笔记已创建并打开。", en: "Example note created and opened." },
  guideFailed: { zh: "示例笔记创建失败，请重试。", en: "Failed to create example note. Please try again." },
  guideStart: { zh: "开始使用", en: "Get started" },
  guideFeaturesTitle: { zh: "核心排版功能", en: "Key features" },
  guideFeatureSideBySideTitle: { zh: "多图自由并排", en: "Side-by-side media" },
  guideFeatureSideBySideDesc: {
    zh: "多张图片或视频同排展示，拖动分割线即时调节比例，拖动底边调整行高，随意拖拽排序。",
    en: "Place multiple images or videos in one row. Drag the dividers to adjust width ratios, drag the bottom edge for row height, and drag items to reorder.",
  },
  guideFeatureTextBesideTitle: { zh: "图文优雅混排", en: "Text beside media" },
  guideFeatureTextBesideDesc: {
    zh: "在图片旁并排放置文字分析，实时预览中点击即可就地编辑，支持靠上、居中或靠底对齐。",
    en: "Place explanatory text directly next to figures. Click to edit in place in Live Preview, with top, middle, or bottom vertical alignment.",
  },
  guideFeatureWrapTitle: { zh: "图文环绕与浮动", en: "Float & text wrap" },
  guideFeatureWrapDesc: {
    zh: "图片或边栏文字卡片可设为左/右浮动，正文自动环绕流动，支持错开首几行（skip）。",
    en: "Float images or text boxes to the left or right with surrounding text wrapping naturally around them, supporting line skips.",
  },
  guideFeatureColumnsTitle: { zh: "多栏流式排版", en: "Multi-column text" },
  guideFeatureColumnsDesc: {
    zh: "纯文本块支持 2~4 栏自动流式分栏排版，自定义栏间距与两端对齐，告别长行视觉疲劳。",
    en: "Flow text through 2 to 4 responsive columns with customizable gaps and text alignment, avoiding wide-line fatigue.",
  },
  guideFeatureCrossrefTitle: { zh: "学术编号与跳转", en: "Smart cross-references" },
  guideFeatureCrossrefDesc: {
    zh: "支持图注（{#fig:...}）、表注（{#tbl:...}）与公式（\\label{eq:...}）自动编号，正文一键引用跳转。",
    en: "Automatic numbering for figures, tables, and equations with clickable cross-references (@fig, @tbl, @eq) compatible with Pandoc.",
  },
  guideQuickStartTitle: { zh: "快速上手方式", en: "Quick start" },
  guideQuickStep1Title: { zh: "创建排版", en: "Create layout" },
  guideQuickStep1Desc: {
    zh: "选中文本或图片行，右键选择「把选中的内容包成布局块」，或使用快捷命令即可创建排版。",
    en: "Select media or text lines, right-click and choose \"Wrap selection in a layout\", or run the command palette action.",
  },
  guideQuickStep2Title: { zh: "交互调整", en: "Adjust interactively" },
  guideQuickStep2Desc: {
    zh: "在「实时预览」模式下，直接鼠标拖拽间隙改宽度、拖拽底边改高度、拖动手柄移动整块，所见即所得。",
    en: "In Live Preview mode, adjust layouts directly by dragging gaps, edges, and handles with your mouse—true WYSIWYG.",
  },
  guideQuickStep3Title: { zh: "安全纯净", en: "Safe & clean" },
  guideQuickStep3Desc: {
    zh: "所有排版配置保存在 HTML 注释中，底层仍为纯标准 Markdown，即使停用插件也绝不破坏笔记内容。",
    en: "All layout configurations are stored in HTML comments. The underlying content remains 100% standard Markdown with zero data lock-in.",
  },
  unreadableSettings: {
    zh: "布局块设置无法读取，已按默认值显示；修好之前不能在这里调整布局块。",
    en: "Layout settings could not be read, so defaults are shown. Layout editing is off until they are fixed.",
  },
  missingMedia: {
    zh: "找不到：{target}",
    en: "Not found: {target}",
  },
  editSource: {
    zh: "编辑源码",
    en: "Edit source",
  },
  editCaption: {
    zh: "编辑图注…",
    en: "Edit caption…",
  },
  alignLeft: {
    zh: "左对齐",
    en: "Align left",
  },
  alignCenter: {
    zh: "居中",
    en: "Align center",
  },
  alignRight: {
    zh: "右对齐",
    en: "Align right",
  },
  moveOut: {
    zh: "移出布局块",
    en: "Move out of layout",
  },
  wrapNone: {
    zh: "不环绕文字",
    en: "No text wrap",
  },
  wrapLeft: {
    zh: "图片靠左，文字环绕",
    en: "Float left, wrap text",
  },
  wrapRight: {
    zh: "图片靠右，文字环绕",
    en: "Float right, wrap text",
  },
  textWrapLeft: {
    zh: "文字块靠左，正文环绕",
    en: "Float text box left, wrap text",
  },
  textWrapRight: {
    zh: "文字块靠右，正文环绕",
    en: "Float text box right, wrap text",
  },
  textLayout: {
    zh: "文字设置…",
    en: "Text settings…",
  },
  textLayoutTitle: {
    zh: "文字设置",
    en: "Text settings",
  },
  textColumns: {
    zh: "分栏数",
    en: "Columns",
  },
  textColumnGap: {
    zh: "栏间距（em）",
    en: "Space between columns (em)",
  },
  textJustify: {
    zh: "文字对齐",
    en: "Text alignment",
  },
  justifyLeft: {
    zh: "左对齐",
    en: "Left",
  },
  justifyCenter: {
    zh: "居中",
    en: "Center",
  },
  justifyRight: {
    zh: "右对齐",
    en: "Right",
  },
  justifyBoth: {
    zh: "两端对齐",
    en: "Justify",
  },
  textSize: {
    zh: "字号（相对正文）",
    en: "Text size (relative to the note)",
  },
  blockPlace: {
    zh: "布局块位置（不环绕时）",
    en: "Layout position (when not floating)",
  },
  placeLeft: {
    zh: "布局块靠左",
    en: "Layout on the left",
  },
  placeCenter: {
    zh: "布局块居中",
    en: "Layout in the middle",
  },
  placeRight: {
    zh: "布局块靠右",
    en: "Layout on the right",
  },
  unwrapText: {
    zh: "取消文字块，保留文字",
    en: "Remove text box, keep its text",
  },
  moveLayout: {
    zh: "拖动以移动布局块",
    en: "Drag to move the layout",
  },
  dropSkip: {
    zh: "下移 {lines} 行",
    en: "{lines} lines down",
  },
  addTextLeft: {
    zh: "在左侧添加文字",
    en: "Add text on the left",
  },
  addTextRight: {
    zh: "在右侧添加文字",
    en: "Add text on the right",
  },
  textTop: {
    zh: "文字顶端对齐",
    en: "Text at the top",
  },
  textCenter: {
    zh: "文字垂直居中",
    en: "Text in the middle",
  },
  textBottom: {
    zh: "文字底端对齐",
    en: "Text at the bottom",
  },
  textNotSaved: {
    zh: "这样写会改变布局块本身（例如只有图片的一行、代码围栏、布局注释，或者清空了文字块），暂不保存。",
    en: "This would change the layout block itself (a line of media embeds only, a code fence, a layout comment, or an emptied text box), so it is not saved.",
  },
  linkSuggestEmpty: {
    zh: "未找到匹配结果",
    en: "No match found",
  },
  linkSuggestHeadingKey: {
    zh: "输入 #",
    en: "Type #",
  },
  linkSuggestHeading: {
    zh: "链接到标题",
    en: "to link a heading",
  },
  linkSuggestDisplayKey: {
    zh: "输入 |",
    en: "Type |",
  },
  linkSuggestDisplay: {
    zh: "指定显示的文本",
    en: "to change the display text",
  },
  writeNotFound: {
    zh: "布局块已在别处被改动，这次修改没有写入，请重试。",
    en: "The layout changed elsewhere, so this change was not saved. Please try again.",
  },
  writeAmbiguous: {
    zh: "笔记里有完全相同的布局块，无法确定要改哪一个，这次修改没有写入。",
    en: "The note has identical layout blocks and it is unclear which one to change, so this change was not saved.",
  },
  writeOverlap: {
    zh: "同一个布局块被同时修改了两次，这次修改没有写入。",
    en: "The same layout block was changed twice at once, so this change was not saved.",
  },
  fileMissing: {
    zh: "找不到这篇笔记，修改没有写入。",
    en: "The note could not be found, so the change was not saved.",
  },
  captionTitle: {
    zh: "图注",
    en: "Caption",
  },
  captionPlaceholder: {
    zh: "输入图注…（Ctrl+Enter 保存）",
    en: "Type a caption… (Ctrl+Enter to save)",
  },
  captionAlignLeft: {
    zh: "居左",
    en: "Left",
  },
  captionAlignCenter: {
    zh: "居中",
    en: "Center",
  },
  save: {
    zh: "保存",
    en: "Save",
  },
  cancel: {
    zh: "取消",
    en: "Cancel",
  },
  close: {
    zh: "关闭",
    en: "Close",
  },
  dragHandle: {
    zh: "拖动以调整位置",
    en: "Drag to move",
  },
  resizeRow: {
    zh: "拖动调整行高",
    en: "Drag to resize the row height",
  },
  resizeColumn: {
    zh: "拖动调整列宽",
    en: "Drag to resize the columns",
  },
  resizeWidth: {
    zh: "拖动调整宽度",
    en: "Drag to resize the width",
  },
  resizeBlockWidth: {
    zh: "拖动调整布局块的宽度",
    en: "Drag to resize the layout's width",
  },
  resizeBlockHeight: {
    zh: "拖动按比例调整所有行的高度",
    en: "Drag to scale the height of every row",
  },
  resizeBlock: {
    zh: "拖动等比缩放布局块",
    en: "Drag to scale the layout",
  },
  wrapInLayout: {
    zh: "包成布局块",
    en: "Wrap in a layout",
  },
  settingAutoConvert: {
    zh: "自动转换拖入或粘贴的图片、视频",
    en: "Convert dropped and pasted media",
  },
  settingAutoConvertDesc: {
    zh: "开启后，拖入或粘贴图片、视频时，新插入的那几行会自动包成布局块；紧跟在已有布局块后面时并入那个块。只处理新插入的行，不会改动笔记的其他内容。",
    en: "When on, media you drop or paste is wrapped in a layout block, or joins the layout block right above it. Only the newly inserted lines are touched.",
  },
  settingRefLanguage: {
    zh: "图表编号的语言",
    en: "Language of figure and table numbers",
  },
  settingRefLanguageDesc: {
    zh: "图注、表注和引用（@fig:名字、@tbl:名字、@eq:名字）显示成“图 1”还是“Figure 1”。改动后重新打开笔记生效。",
    en: "Whether captions and references (@fig:name, @tbl:name, @eq:name) read \u201cFigure 1\u201d or \u201c图 1\u201d. Takes effect when a note is opened again.",
  },
  refLanguageAuto: {
    zh: "跟随 Obsidian",
    en: "Same as Obsidian",
  },
  cmdWrap: {
    zh: "把选中的内容包成布局块",
    en: "Wrap selection in a layout",
  },
  cmdMerge: {
    zh: "与下一个布局块合并",
    en: "Merge with the next layout",
  },
  cmdUnwrap: {
    zh: "移除当前布局块的注释",
    en: "Remove the layout comments here",
  },
  cmdRemoveAll: {
    zh: "移除所有笔记中的布局块注释…",
    en: "Remove layout comments from all notes…",
  },
  wrapNothing: {
    zh: "选中的内容不能包成布局块：它已经在布局块里，含有代码、公式或注释，或者文字夹在两行图片之间。",
    en: "The selection cannot be wrapped: it is already in a layout, holds code, math or comments, or has text between two rows of media.",
  },
  mergeNothing: {
    zh: "光标所在的布局块后面没有紧挨着的布局块，或者其中一个块不能编辑、带有文字。",
    en: "There is no layout block right after this one, or one of the two cannot be edited or has text beside its media.",
  },
  unwrapNothing: {
    zh: "光标不在布局块里。",
    en: "The cursor is not in a layout block.",
  },
  removeAllTitle: {
    zh: "移除布局块注释",
    en: "Remove layout comments",
  },
  removeAllSummary: {
    zh: "将移除 {files} 篇笔记中 {blocks} 个布局块的注释，图片和视频嵌入保持不变。",
    en: "This removes the comments of {blocks} layout blocks in {files} notes. The embeds stay as they are.",
  },
  removeAllNone: {
    zh: "没有找到布局块。",
    en: "No layout blocks found.",
  },
  removeAllConfirm: {
    zh: "移除",
    en: "Remove",
  },
  removeAllDone: {
    zh: "已移除 {files} 篇笔记中 {blocks} 个布局块的注释。",
    en: "Removed the comments of {blocks} layout blocks in {files} notes.",
  },
  removeAllFailed: {
    zh: "有 {count} 篇笔记没有改动，因为它们在预览之后发生了变化。",
    en: "{count} notes were left unchanged because they changed after the preview.",
  },
} as const;

export type MessageKey = keyof typeof MESSAGES;

export type UiLanguageSetting = "auto" | "en" | "zh";
let uiLanguageSetting: () => UiLanguageSetting = () => "auto";

export function setUiLanguage(provider: () => UiLanguageSetting): void {
  uiLanguageSetting = provider;
}

function detectObsidianLanguage(): "zh" | "en" {
  try {
    const storageLang = typeof window !== "undefined" ? window.localStorage?.getItem("language") : null;
    if (storageLang) {
      return storageLang.toLowerCase().startsWith("zh") ? "zh" : "en";
    }
  } catch {
    // ignore
  }
  try {
    const docLang = typeof document !== "undefined" ? document.documentElement?.lang : "";
    if (docLang) {
      return docLang.toLowerCase().startsWith("zh") ? "zh" : "en";
    }
  } catch {
    // ignore
  }
  try {
    const locale = typeof moment !== "undefined" && typeof moment.locale === "function" ? moment.locale() : "";
    if (locale) {
      return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
    }
  } catch {
    // ignore
  }
  return "en";
}

export function currentLanguage(explicit?: "zh" | "en"): "zh" | "en" {
  if (explicit) return explicit;
  const setting = uiLanguageSetting();
  if (setting === "zh" || setting === "en") return setting;
  return detectObsidianLanguage();
}

export function t(key: MessageKey, values: Record<string, string> = {}, lang?: "zh" | "en"): string {
  const language = currentLanguage(lang);
  return MESSAGES[key][language].replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? "");
}

export function blockWarning(block: V2Block): string | null {
  return block.metaError === null ? null : t("unreadableSettings");
}
