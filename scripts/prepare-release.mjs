import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
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

// Only the files Obsidian downloads. The release workflow attests their build provenance.
const releaseDir = path.join("dist", manifest.id);
const releaseFiles = ["main.js", "manifest.json", "styles.css"];

await rm(releaseDir, { force: true, recursive: true });
await mkdir(releaseDir, { recursive: true });
for (const file of releaseFiles) {
  await copyFile(file, path.join(releaseDir, file));
}

console.log(`Prepared ${manifest.name} ${manifest.version} in ${releaseDir}`);
