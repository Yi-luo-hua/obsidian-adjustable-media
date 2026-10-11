# 移动端测试工具

这些工具只创建或连接专用测试库，不部署到真实笔记库。Android 手机／平板、iPhone／iPad 使用相同的回归笔记和插件构建；按平台与窗格宽度选择实际操作。

## 生成测试库

先运行 `npm run build`。素材目录提供 `square.png`、`landscape.png` 和 `clip.mp4`，通过参数传入，不依赖开发者本机的笔记库路径。

```powershell
node scripts/prepare-mobile-test.mjs --assets '<素材目录>'
node scripts/prepare-mobile-test.mjs --assets '<素材目录>' --tablet
node scripts/prepare-mobile-test.mjs --assets '<素材目录>' --platform ios
node scripts/prepare-mobile-test.mjs --assets '<素材目录>' --platform ios --tablet
```

输出依次位于 `dist/adjustable-media-mobile-test/`、`dist/adjustable-media-tablet-test/`、`dist/adjustable-media-iphone-test/`、`dist/adjustable-media-ipad-test/`。命令会更新这些生成目录中的配置和样例；不要在设备已编辑的库中覆盖执行。生成库中的 manifest 临时允许移动端，不修改仓库的正式 manifest。

01／02／03／05 的基础样例由生成器创建；06–14 与操作清单来自 [mobile-test-notes](mobile-test-notes/00%20从这里开始.md)。13／14 只补 Mermaid 混排、触摸把手、缩放、源码编辑与块外拖入回归。`build-info.json` 记录实际构建哈希、目标平台和只读基线。没有捆绑真实笔记或媒体素材。

Mobile acceptance 默认停用，避免诊断记录影响启动时序；发现问题时可在测试库内启用。也可加 `--diagnostics`，让生成库默认启用它。报告是原始观察，不能代替手指、输入法和生命周期操作的人工结果。

## Android 宿主探针

安装 Android platform-tools，让 `adb` 在 PATH 中，或设置 `VML_ADB_PATH`。只有一台设备连接时直接使用 ADB 的默认选择；多台设备时设置 `VML_ANDROID_SERIAL`。不内置个人设备序列号。

```powershell
$env:VML_ANDROID_SERIAL = '<设备序列号>'
$env:VML_MOBILE_VAULT = 'adjustable-media-tablet-test'
node scripts/mobile-cdp.mjs '<探针脚本.js>' '<截图.png>'
```

默认测试库为 `adjustable-media-mobile-test`，默认端口为 18709，可用 `VML_ANDROID_PORT` 改变。连接后先核对实际库名，仅接受上述两个 Android 测试库；探针在 Obsidian WebView 中运行。`VML_CDP_ACTIONS` 可指定原生输入序列 JSON，或设为 `@result` 读取探针结果中的 actions；`VML_CDP_LISTENERS` 用于读取事件监听。

探针结束会关闭 WebSocket，ADB 端口转发保留供连续调试；测试收尾时对本次端口执行 `adb [-s <设备序列号>] forward --remove tcp:18709`。改动测试笔记前备份，测完恢复并核对。iPhone／iPad 使用手动导入与真机操作，不使用 Android CDP 工具。
