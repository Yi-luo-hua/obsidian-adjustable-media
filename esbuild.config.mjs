import esbuild from "esbuild";
import builtins from "builtin-modules";
import process from "node:process";

const production = process.argv.includes("production");
const watch = process.argv.includes("--watch");

// Obsidian provides these modules at runtime, so they stay out of the bundle.
const external = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
  ...builtins,
];

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  outfile: "main.js",
  bundle: true,
  external,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  treeShaking: true,
  minify: production,
  sourcemap: production ? false : "inline",
  banner: { js: "/* Adjustable Media: built by esbuild from main.ts. Do not edit main.js by hand. */" },
  logLevel: "info",
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
}
