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

Instead of committing your public key to `tauri.conf.json`, you can provide it via an environment variable.

1. **tauri.conf.json**: The `pubkey` is set to `__SIGNING_PUBKEY_ENV__`.
2. **Environment**: Add your keys and endpoint to the `.env` file in the `frontend` directory:
   - `TAURI_SIGNING_PUBLIC_KEY="your-public-key-string"`
   - `TAURI_UPDATE_ENDPOINT="https://github.com/.../latest.json"` (Optional, defaults to main repo)
   - `TAURI_KEY_PASSWORD="your-password"` (if applicable)

## Build & Release

The `scripts/build-and-release.js` script will:

1. Load variables from your `.env` file.
2. Look for `keys/private.key` for signing.
3. Automatically inject the `TAURI_SIGNING_PUBLIC_KEY` and `TAURI_UPDATE_ENDPOINT` into `tauri.conf.json` during the build and revert it afterwards.
