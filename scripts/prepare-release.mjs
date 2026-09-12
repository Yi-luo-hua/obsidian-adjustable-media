import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const manifest = await readJson("manifest.json");
const packageJson = await readJson("package.json");
const versions = await readJson("versions.json");

// One version everywhere, and versions.json must say which Obsidian version it needs.
if (packageJson.version !== manifest.version) {
  throw new Error(`package.json version ${packageJson.version} does not match manifest.json version ${manifest.version}`);
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(`versions.json must map ${manifest.version} to minAppVersion ${manifest.minAppVersion}`);
}

const releaseDir = path.join("dist", manifest.id);
const releaseFiles = ["main.js", "manifest.json", "styles.css"];

await rm(releaseDir, { force: true, recursive: true });
await mkdir(releaseDir, { recursive: true });

const checksumLines = [];
for (const file of releaseFiles) {
  const input = await readFile(file);
  await copyFile(file, path.join(releaseDir, file));
  checksumLines.push(`${createHash("sha256").update(input).digest("hex")}  ${file}`);
}

await writeFile(path.join(releaseDir, "sha256sums.txt"), `${checksumLines.join("\n")}\n`);

console.log(`Prepared ${manifest.name} ${manifest.version} in ${releaseDir}`);
