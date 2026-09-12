# 发布流程

## 1. 更新版本号

三处必须一致，`npm run release` 会检查：

- `manifest.json` 的 `version`
- `package.json` 的 `version`
- `versions.json`：新增一行，把新版本映射到 `manifest.json` 里的 `minAppVersion`

同时在 `CHANGELOG.md` 写好这一版的条目，标题写成 `## 0.1.0 - 2026-09-12` 的形式。Release 的说明由 `scripts/release-notes.mjs` 生成：先是这一条目，后面接 `docs/RELEASE_NOTES_TEMPLATE.md` 里的安装说明。可以用 `node scripts/release-notes.mjs` 预览。

## 2. 本地检查

```bash
npm run check
```

```bash
npm run release
```

`npm run release` 会做生产构建，并在 `dist/adjustable-media/` 里生成 `main.js`、`manifest.json`、`styles.css`。只放 Obsidian 会下载的这三个文件，多余的文件会被社区目录的审核标出来。

## 3. 推送版本标签

标签就是版本号本身，不带 `v`，例如 `0.1.0`（官方插件库要求如此）：

```bash
git tag 0.1.0
```

```bash
git push origin 0.1.0
```

推送后，`.github/workflows/release.yml` 会检查标签和 `manifest.json` 的版本是否一致，运行测试和构建，然后创建一个**草稿** Release，附上上面三个文件和生成好的说明，并为这三个文件生成构建来源证明（artifact attestation）。用户可以用 `gh attestation verify main.js --repo Yi-luo-hua/obsidian-adjustable-media` 验证文件确实是从这个仓库构建的。

## 4. 发布

在 GitHub 上打开草稿 Release，核对说明和附件，确认无误后手动点「Publish release」。

## 5. 提交到社区插件目录（只在第一次）

插件现在不再通过给 `obsidianmd/obsidian-releases` 发 PR 提交，而是在 [community.obsidian.md](https://community.obsidian.md) 提交（官方文档：[Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)）：

1. 用 Obsidian 账号登录 community.obsidian.md。
2. 在个人资料的 **GitHub** 一栏点 **Connect**，关联 GitHub 账号。这是只读授权，用来验证仓库归属。
3. 在侧栏的 **Plugins** 页点 **New plugin**，**GitHub repository URL** 填 `https://github.com/Yi-luo-hua/obsidian-adjustable-media`，**Owner** 选自己，同意开发者政策后点 **Submit**。

目录读取默认分支 HEAD 上的 `manifest.json`，安装时下载标签与其中 `version` 相同的 Release，所以提交前两者都要就绪。提交后会自动审核，需要修改的地方会显示在目录页面上；改完后发布一个版本号更高的新 Release。插件上架后，之后的版本只要发布新的 Release 即可。

建议在个人资料里打开 **Action required notifications**：插件检查失败或需要处理时会收到邮件。
