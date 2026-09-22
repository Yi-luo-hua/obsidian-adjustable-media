import zh from "../../docs/examples/Guide.zh-CN.md";
import en from "../../docs/examples/Guide.en.md";
import raw from "../../docs/examples/assets/raw.svg";
import mean from "../../docs/examples/assets/mean.svg";
import video from "../../docs/examples/assets/window.webm";

export type GuideLanguage = "zh" | "en";
export const GUIDE_TEXT = { zh, en };

/** Included in main.js: the standard three release files are sufficient, even offline. */
export function guideAssets(): { name: string; type: string; data: Uint8Array<ArrayBuffer> }[] {
  return [
    { name: "raw.svg", type: "image/svg+xml", data: new TextEncoder().encode(raw) },
    { name: "mean.svg", type: "image/svg+xml", data: new TextEncoder().encode(mean) },
    { name: "window.webm", type: "video/webm", data: Uint8Array.from(atob(video), (char) => char.charCodeAt(0)) },
  ];
}
