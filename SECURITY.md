# Security Policy

## Official downloads

Install Adjustable Media from Community plugins once it's listed, or from the GitHub releases of this repository.

Don't install builds from cloud drive links, chat attachments, reposted zip files or third-party mirrors.

## Verifying a release

Release files are built by GitHub Actions from the tagged source and come with [build provenance attestations](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds). With the [GitHub CLI](https://cli.github.com), you can check a downloaded file like this:

```bash
gh attestation verify main.js --repo Yi-luo-hua/obsidian-adjustable-media
```

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's private vulnerability reporting instead: open this repository's **Security** tab and choose **Report a vulnerability**.

Include:

- Plugin version
- Obsidian version
- Operating system
- Steps to reproduce
- What data or behavior may be affected

## Scope

The plugin runs locally and makes no network requests of its own. It changes notes only in response to layout actions you take, or through automatic conversion if you turn it on. It reads every note in the vault only when you run **Remove layout comments from all notes…**, to find the layouts to remove.
