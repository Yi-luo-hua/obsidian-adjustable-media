import { moment } from "obsidian";

import type { V2Block } from "../format/v2.ts";

// UI text follows Obsidian's language: Chinese for zh locales, English otherwise.
const MESSAGES = {
  unreadableSettings: {
    zh: "布局设置无法读取，已按默认值显示；修好之前不能在这里调整布局。",
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
    zh: "移出布局",
    en: "Move out of layout",
  },
  writeNotFound: {
    zh: "布局已在别处被改动，这次修改没有写入，请重试。",
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
    zh: "拖动调整布局的宽度",
    en: "Drag to resize the layout's width",
  },
  resizeBlockHeight: {
    zh: "拖动按比例调整所有行的高度",
    en: "Drag to scale the height of every row",
  },
  resizeBlock: {
    zh: "拖动等比缩放布局",
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
  cmdWrap: {
    zh: "把选中的图片、视频包成布局块",
    en: "Wrap selected media in a layout",
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
    zh: "移除所有笔记中的布局注释…",
    en: "Remove layout comments from all notes…",
  },
  wrapNothing: {
    zh: "选中的内容里只能有图片或视频嵌入，而且不能已经在布局块里。",
    en: "The selection must contain only image or video embeds that are not already in a layout.",
  },
  mergeNothing: {
    zh: "光标所在的布局块后面没有紧挨着的布局块，或者其中一个块不能编辑。",
    en: "There is no editable layout block right after this one.",
  },
  unwrapNothing: {
    zh: "光标不在布局块里。",
    en: "The cursor is not in a layout block.",
  },
  removeAllTitle: {
    zh: "移除布局注释",
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

export function t(key: MessageKey, values: Record<string, string> = {}): string {
  const language = moment.locale().toLowerCase().startsWith("zh") ? "zh" : "en";
  return MESSAGES[key][language].replace(/\{(\w+)\}/g, (_match, name: string) => values[name] ?? "");
}

export function blockWarning(block: V2Block): string | null {
  return block.metaError === null ? null : t("unreadableSettings");
}
