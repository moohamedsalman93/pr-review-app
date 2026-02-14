# Tauri Signing Keys

To enable Over-The-Air (OTA) updates, your application must be signed. This ensures that the updater only installs authentic updates.

## Generating Keys

Run the following command in the `frontend` directory:

```bash
npx tauri signer generate -w keys/private.key
```

- **`keys/private.key`**: This file contains your private key. **DO NOT commit this to git.**
- **Output**: The command will also print a **Public Key**.

## Configuration

1. **tauri.conf.json**: Copy the Public Key into the `plugins.updater.pubkey` field in `src-tauri/tauri.conf.json`.
2. **Environment**: When running the build script, ensure you have set the password if you used one during key generation:
   - `$env:TAURI_KEY_PASSWORD="your-password"` (PowerShell)

## Build & Release

The `scripts/build-and-release.js` script will automatically look for `keys/private.key`. If found, it will enable signing during the build process and generate the required `.sig` files for OTA updates.
