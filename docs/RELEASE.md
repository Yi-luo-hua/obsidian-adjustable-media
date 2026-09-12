# 发布流程

## 1. 更新版本号

三处必须一致，`npm run release` 会检查：

- `manifest.json` 的 `version`
- `package.json` 的 `version`
- `versions.json`：新增一行，把新版本映射到 `manifest.json` 里的 `minAppVersion`

同时在 `CHANGELOG.md` 写好这一版的变化，并按需要修改 `docs/RELEASE_NOTES_TEMPLATE.md`。

## 2. 本地检查

```bash
npm run check
```

```bash
npm run release
```

`npm run release` 会做生产构建，并在 `dist/adjustable-media/` 里生成 `main.js`、`manifest.json`、`styles.css` 和 `sha256sums.txt`。

## 3. 推送版本标签

标签就是版本号本身，不带 `v`，例如 `0.1.0`（官方插件库要求如此）：

```bash
git tag 0.1.0
```

```bash
git push origin 0.1.0
```

推送后，`.github/workflows/release.yml` 会检查标签和 `manifest.json` 的版本是否一致，运行测试和构建，然后创建一个**草稿** Release，附上上面四个文件，说明取自 `docs/RELEASE_NOTES_TEMPLATE.md`。

## 4. 发布

在 GitHub 上打开草稿 Release，核对说明和附件，确认无误后手动点「Publish release」。

## 5. 提交到官方插件库（只在第一次）

第一个 Release 正式发布之后，向 `obsidianmd/obsidian-releases` 提交 PR，在 `community-plugins.json` 末尾加入：

```json
{
  "id": "adjustable-media",
  "name": "Adjustable Media",
  "author": "Yi-luo-hua",
  "description": "Arrange images and videos side by side, then drag to reorder and resize them. Notes keep plain embeds plus an HTML comment, so they stay readable without the plugin.",
  "repo": "Yi-luo-hua/obsidian-adjustable-media"
}
```

`id`、`name`、`description` 必须和 `manifest.json` 完全一致。PR 会先经过自动检查，再由人工审核；审核意见在 PR 里回复。之后的版本只要发布新的 Release，不需要再提交 PR。
