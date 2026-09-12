// Prints the release notes for the version in manifest.json: its entry from CHANGELOG.md,
// followed by the installation notes in docs/RELEASE_NOTES_TEMPLATE.md.
import { readFile } from "node:fs/promises";
import process from "node:process";

const read = async (file) => (await readFile(file, "utf8")).replace(/\r\n/g, "\n");

const { version } = JSON.parse(await read("manifest.json"));
const lines = (await read("CHANGELOG.md")).split("\n");
const template = await read("docs/RELEASE_NOTES_TEMPLATE.md");

// Entries start with "## <version>" or "## <version> - <date>".
const start = lines.findIndex((line) => line === `## ${version}` || line.startsWith(`## ${version} `));
if (start === -1) {
  throw new Error(`CHANGELOG.md has no entry for ${version}`);
}
const next = lines.findIndex((line, index) => index > start && line.startsWith("## "));
const entry = lines.slice(start + 1, next === -1 ? lines.length : next).join("\n").trim();

process.stdout.write(`## Changes\n\n${entry}\n\n${template.trim()}\n`);
