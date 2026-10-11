## Installation

Download `main.js`, `manifest.json` and `styles.css` from this release and put them in:

```text
<your vault>/.obsidian/plugins/adjustable-media
```

Restart Obsidian and enable Adjustable Media in Settings → Community plugins.

## Compatibility

- Obsidian 1.5.0 or newer
- Desktop, Android, iPhone and iPad
- Plugin ID: `adjustable-media`

Device and build-specific validation is recorded in the repository's `docs/plans/layout-redesign/mobile-adaptation.md`. The latest standalone Mermaid hold-and-drop gestures were verified on an Android tablet; those new gestures have not been retested on Android phones or iOS.

## Verifying the files

These files are built by GitHub Actions from the tagged source and come with build provenance attestations. To check a downloaded file with the GitHub CLI:

```bash
gh attestation verify main.js --repo Yi-luo-hua/obsidian-adjustable-media
```
