# Installing Adjustable Media

## From Community plugins

1. Open Settings → Community plugins and turn off Restricted mode if it's on.
2. Click Browse, search for Adjustable Media, then click Install and Enable.
3. If you want automatic conversion of dropped and pasted media, turn it on in the plugin's settings.

Obsidian tells you when an update is available, under Settings → Community plugins.

## From GitHub releases

1. Open the latest release of this repository.
2. Download `main.js`, `manifest.json` and `styles.css`. To check that they were built from this repository, see [Verifying a release](../SECURITY.md#verifying-a-release).
3. Create this folder in your vault:

   ```text
   <your vault>/.obsidian/plugins/adjustable-media
   ```

4. Move the three files into it.
5. Restart Obsidian.
6. Open Settings → Community plugins, turn off Restricted mode if it's on, and enable Adjustable Media.
7. If you want automatic conversion of dropped and pasted media, turn it on in the plugin's settings.

## Compatibility

| | |
| --- | --- |
| Obsidian | 1.5.0 or newer is required; recent Windows checks used 1.14.4 |
| Desktop | Supported |
| Mobile | Android, iPhone and iPad are supported from 0.8.0; the current public release is 0.9.0. |

The minimum version is a compatibility declaration, not a claim that every host version, theme and device was tested. See [project status](STATUS.md) and the [mobile validation record](plans/layout-redesign/mobile-adaptation.md) for each build's coverage. Standalone Mermaid hold-and-drop gestures were verified on an Android tablet; those gestures have not been retested on Android phones or iOS. Mobile devices were not retested for 0.9.0.

## Updating

Replace the three files with the ones from the new release, then turn the plugin off and on again in Settings → Community plugins, or restart Obsidian.
