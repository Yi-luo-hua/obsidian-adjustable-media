import zh from "../../docs/examples/Guide.zh-CN.md";
import en from "../../docs/examples/Guide.en.md";
import loraArch from "../../docs/examples/assets/lora-arch.png";
import loraEval from "../../docs/examples/assets/lora-eval.png";
import gpt2Perf from "../../docs/examples/assets/gpt2-perf.png";
import video from "../../docs/examples/assets/window.webm";

export type GuideLanguage = "zh" | "en";
export const GUIDE_TEXT = { zh, en };

function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Included in main.js: offline media for standalone example note creation. */
export function guideAssets(): { name: string; type: string; data: Uint8Array<ArrayBuffer> }[] {
  return [
    { name: "lora-arch.png", type: "image/png", data: decodeBase64(loraArch) },
    { name: "lora-eval.png", type: "image/png", data: decodeBase64(loraEval) },
    { name: "gpt2-perf.png", type: "image/png", data: decodeBase64(gpt2Perf) },
    { name: "window.webm", type: "video/webm", data: decodeBase64(video) },
  ];
}
