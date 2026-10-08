import esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";

// Diagnostic build only: observe the real controllers without adding production debug interfaces.
await esbuild.build({
  entryPoints: ["main.ts"], outfile: "dist/w01-probe/main.js", bundle: true, format: "cjs", platform: "browser",
  target: "es2022", minify: true,
  loader: { ".md": "text", ".svg": "text", ".webm": "base64", ".png": "base64", ".jpg": "base64", ".jpeg": "base64" },
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  plugins: [{ name: "lifecycle-observations", setup(build) {
    build.onLoad({ filter: /viewProjection\.ts$/ }, async args => ({ loader: "ts", contents: (await readFile(args.path, "utf8"))
      .replace("export class ViewProjection {", "export class ViewProjection { constructor() { globalThis.__w01Trace?.attachProjection(this); }") }));
    build.onLoad({ filter: /viewEnvironment\.ts$/ }, async args => ({ loader: "ts", contents: (await readFile(args.path, "utf8"))
      .replace("  const win = el.win", "  globalThis.__w01Trace?.environmentStarted(el);\n  const win = el.win")
      .replace("    stopped = true;", "    globalThis.__w01Trace?.environmentStopped(el);\n    stopped = true;") }));
    for (const [name, effects] of [["livePreview", "setEnvironment,setParagraphSections,setLayoutHighlight"], ["wrapGuard", "setGaps,setProxies,resetWrapGaps"]]) {
      build.onLoad({ filter: new RegExp(`${name}\\.ts$`) }, async args => ({ loader: "ts",
        contents: (await readFile(args.path, "utf8")).replace("    activeGuards.set(view, this);", "    globalThis.__w01Trace?.attachGuard(this);\n    activeGuards.set(view, this);") + `\nglobalThis.__w01Trace?.effectsTypes.push(${effects});` }));
    }
    build.onLoad({ filter: /readingView\.ts$/ }, async args => ({ loader: "ts", contents: (await readFile(args.path, "utf8"))
      .replace("        if (visible && section?.computed", "        globalThis.__w01Trace?.readiness.push({path:reader.file.path,range:record.range,visible,computed:section?.computed,rendered:section?.rendered,shown:section?.shown,ready,found:!!section});\n        if (visible && section?.computed") }));
    build.onLoad({ filter: /obsidianInternals\.ts$/ }, async args => ({ loader: "ts", contents: (await readFile(args.path, "utf8"))
      .replace("export function remeasureSections(app: App, el: HTMLElement, from: number, to: number): boolean {", "export function remeasureSections(app: App, el: HTMLElement, from: number, to: number): boolean { globalThis.__w01Trace?.readingRounds.push({at:performance.now(),from,to,width:el.parentElement?.clientWidth});") + "\nglobalThis.__w01Trace && (globalThis.__w01Trace.readingSectionsOfView=readingSectionsOfView);" }));
    build.onLoad({ filter: /readingWrap\.ts$/ }, async args => ({ loader: "ts", contents: await readFile(args.path, "utf8")
      + "\nglobalThis.__w01Trace && (globalThis.__w01Trace.readingApi={settle,budgets,asked,refreshReadingWrap,readingMeasurementsReady});" }));
  } }],
});
