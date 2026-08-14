# Releasing

Building Sunlight Simulator uses a tag-driven release pipeline.

## Local checks

Run the same frontend checks used by CI:

```bash
npm ci
npm test
npm run test:browser
npm run desktop:verify
```

The desktop build is performed by Tauri on the current operating system:

```bash
npm run desktop:build
```

The release matrix uses these bundle targets:

| Runner | Tauri targets |
|---|---|
| Windows | `nsis,msi` |
| macOS | `dmg` |
| Ubuntu | `appimage,deb` |

## Publishing

1. Update the versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` together.
2. Update the changelog and commit the release.
3. Push an annotated `vX.Y.Z` tag.
4. GitHub Actions creates a draft Release, builds each platform, uploads the bundles, and writes `SHA256SUMS.txt`.
5. Check the draft assets and publish the Release only after all platform artifacts are present.

The release workflow deliberately keeps a failed or incomplete build as a draft instead of publishing a partial release.

## Signing before public distribution

The repository contains no signing material. Before distributing to ordinary users, configure protected GitHub Secrets and add the corresponding platform signing steps:

- Windows: Authenticode certificate (PFX) and a timestamped `signtool` invocation for the app executable, NSIS installer, and MSI.
- macOS: Developer ID Application / Installer identity, `notarytool` credentials, and stapling for the `.app` and `.dmg`.
- Linux: optionally sign the checksum file or publish it through a signed release tag.

Do not commit certificates, private keys, notarization passwords, or generated `dist/` and `target/` files.
