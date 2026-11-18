# Installing Adjustable Media

## From Community plugins

1. Open **Settings → Community plugins** and turn off Restricted mode if it's on.
2. Click **Browse**, search for **Adjustable Media**, then click **Install** and **Enable**.
3. If you want automatic conversion of dropped and pasted media, turn it on in the plugin's settings.

Obsidian notifies you when an update is available under **Settings → Community plugins**.

## From GitHub releases

1. Open the [latest release](https://github.com/Yi-luo-hua/obsidian-adjustable-media/releases/latest) of this repository.
2. Download `main.js`, `manifest.json`, and `styles.css`. To verify build provenance, see [Verifying a release](../SECURITY.md#verifying-a-release).
3. Place the three files into `<your vault>/.obsidian/plugins/adjustable-media/`.
4. Restart Obsidian, turn off Restricted mode if needed, and enable **Adjustable Media** in **Settings → Community plugins**.

## Compatibility

| Item | Support |
| --- | --- |
| Obsidian | **1.5.0** or newer (`1.6.0+` for the Markdown table cell menu) |
| Desktop | Supported |
| Mobile | Android, iPhone, and iPad (`isDesktopOnly: false`) |

`minAppVersion` is a compatibility baseline rather than a guarantee across all themes, host versions, and devices. Recent desktop updates (0.9.0–1.0.0) have not all been retested on mobile; see [project status](STATUS.md) and the [mobile adaptation record](plans/layout-redesign/mobile-adaptation.md) for tested coverage.

## Updating

Replace the three plugin files with those from the new release, then disable and re-enable the plugin (or restart Obsidian).

If images stretch or the **Edit source** button appears below the image after an update, download `styles.css` from the installed version's GitHub release and put it in the plugin folder. Disable and re-enable Adjustable Media to reload its styles. Existing layout blocks will pick up the restored styles.
