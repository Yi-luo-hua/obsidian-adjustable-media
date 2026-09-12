import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// The same rules the Obsidian community plugin review runs.
export default defineConfig([
  globalIgnores(["node_modules/", "dist/", "main.js"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs", "esbuild.config.mjs", "scripts/*.mjs"],
        },
      },
    },
  },
  {
    // Build scripts run in Node, not in Obsidian, and report progress on the console.
    files: ["esbuild.config.mjs", "scripts/**/*.mjs"],
    rules: { "obsidianmd/rule-custom-message": "off" },
  },
  {
    // node:test keeps track of the promise that test() returns.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
]);
