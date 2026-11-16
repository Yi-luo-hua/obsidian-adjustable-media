# 发布流程

## 1. 更新版本号

三处必须一致，`npm run release` 会自动校验：

- `manifest.json` 的 `version`
- `package.json` 的 `version`
- `versions.json`：新增一行，把新版本映射到 `manifest.json` 里的 `minAppVersion`

同时在 `CHANGELOG.md` 写好这一版的条目，标题格式为 `## X.Y.Z - YYYY-MM-DD`。GitHub Release 说明由 `scripts/release-notes.mjs` 生成（提取当前版本的 `CHANGELOG.md` 条目 + `docs/RELEASE_NOTES_TEMPLATE.md`），可用 `node scripts/release-notes.mjs` 预览。

插件内的更新弹窗正文放在 `docs/releases/<版本>.zh-CN.md` 和 `<版本>.en.md`，由 `src/guide/releaseContent.ts` 引入打包；同步更新 `src/guide/releaseState.ts` 中的版本。未发布的改动先放在 `CHANGELOG.md` 的 `Unreleased` 节，准备发版时再移入对应版本节。

## 2. 本地检查与构建

```bash
npm run check
```

```bash
npm run release
```

`npm run release` 会做生产构建，并在 `dist/adjustable-media/` 下生成 `main.js`、`manifest.json`、`styles.css`。不要附加额外文件，避免被社区目录审核标记。

本地打包完成、推送标签、创建草稿和正式发布属于不同阶段：正式发布前 README 与 [项目状态](STATUS.md) 保持标注当前公开版本；发版后再同步更新，并在 `docs/releases/<版本>-readiness.md` 记录本次验证范围与附件校验值。当前公开版本为 **1.0.0**（见 [1.0.0 核验](releases/1.0.0-readiness.md)）。

## 3. 推送版本标签

标签为版本号本身，不带 `v`（例如 `1.0.0`）：

```bash
git tag 1.0.0
git push origin 1.0.0
```

推送后，`.github/workflows/release.yml` 会核对标签与 `manifest.json` 一致性，运行测试与构建，生成草稿 Release，并为三个附件生成构建来源证明（artifact attestation）。

## 4. 发布

在 GitHub 打开草稿 Release，核对正文与三个附件后点击 **Publish release**。

## 5. 社区插件目录说明

社区目录通过 [community.obsidian.md](https://community.obsidian.md) 提交并审核（官方文档：[Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)）。目录读取默认分支 HEAD 上的 `manifest.json`，安装时下载同名 tag 的 Release；插件上架后，后续版本只需发布新 Release 即可。
