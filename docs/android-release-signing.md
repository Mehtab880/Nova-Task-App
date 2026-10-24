# Android release signing

M4 is still pending physical-device verification. This document covers repository
safety and release-build signing only; it does not change the reminder
architecture.

## Current behavior

`apps/mobile/android/app/build.gradle` reads `apps/mobile/android/keystore.properties`.

- **With** a complete `keystore.properties`: release builds use that keystore.
- **Without** it: local/CI smoke builds still work, but Gradle prints a
  `NON-DISTRIBUTABLE RELEASE` warning and signs with the public debug key.
- **Fail closed:** pass `-PrequireReleaseSigning=true` to fail configuration when
  `keystore.properties` is absent. Use this for store/CI release jobs.
- Incomplete properties or a missing keystore file also fail configuration.

The committed `apps/mobile/android/app/debug.keystore` is the public AOSP debug
key with the well-known password `android`. It is intentionally tracked so local
debug builds work. It must never sign a distributed artifact.

## Create a local release key

Run from `apps/mobile/android/app`:

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore release.jks \
  -alias novatask \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Back up `release.jks` and its passwords in a password manager or secret store.
Losing the key prevents updates to an installed app unless Play App Signing is
used. Never commit the key, `keystore.properties`, or passwords.

Create `apps/mobile/android/keystore.properties` from the example:

```properties
storeFile=release.jks
storePassword=REPLACE_WITH_STORE_PASSWORD
keyAlias=novatask
keyPassword=REPLACE_WITH_KEY_PASSWORD
```

`storeFile` is resolved relative to `apps/mobile/android/app/` unless an absolute
path is supplied. Both `*.jks` and `keystore.properties` are gitignored.

Inspect the certificate before building:

```bash
keytool -list -v -keystore release.jks -alias novatask
```

## Build and verify a signed release

From `apps/mobile/android`:

```bash
./gradlew :app:assembleProdRelease -PrequireReleaseSigning=true
```

Verify the APK signer with the Android build tools:

```bash
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs \
  app/build/outputs/apk/prod/release/app-prod-release.apk
```

The certificate digest must match the release key, not `CN=Android Debug`.

## CI secrets

Use a dedicated CI keystore, not a developer's local key. Store these as CI
secrets (for example in a protected GitHub Environment):

| Secret                      | Value                                              |
| --------------------------- | -------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64 of the PKCS12/JKS keystore                  |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                                  |
| `ANDROID_KEY_ALIAS`         | Key alias (for example `novatask-ci`)              |
| `ANDROID_KEY_PASSWORD`      | Key password, if different from the store password |

Create the base64 value locally:

```bash
# Linux
base64 -w 0 release.jks > release.jks.base64

# macOS
base64 -i release.jks -o release.jks.base64

# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.jks")) |
  Set-Content -NoNewline release.jks.base64
```

Never commit `release.jks.base64`; keep it outside the repository.

Example CI step, placed before the Gradle release build:

```yaml
- name: Configure Android release signing
  env:
    ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
    ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
    ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
    ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
  run: |
    set -euo pipefail
    printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode \
      > apps/mobile/android/app/release.jks
    cat > apps/mobile/android/keystore.properties <<EOF
    storeFile=release.jks
    storePassword=${ANDROID_KEYSTORE_PASSWORD}
    keyAlias=${ANDROID_KEY_ALIAS}
    keyPassword=${ANDROID_KEY_PASSWORD}
    EOF
```

Then build with fail-closed signing:

```bash
cd apps/mobile/android
./gradlew :app:assembleProdRelease -PrequireReleaseSigning=true
```

Remove the keystore and properties file in an `always()` cleanup step on
self-hosted runners. GitHub-hosted runners are ephemeral, but cleanup is still
recommended.

Do not print secrets or run `set -x` in the signing step. Restrict the release
job to protected branches/tags or a protected environment, and rotate the CI key
if it is ever exposed.

## Current CI note

The checked-in CI workflow builds a release APK for compile/lint/package
verification. Without the secrets above, that APK is debug-signed and is
**NON-DISTRIBUTABLE**. Add a separate signed-release job with the secrets and
`-PrequireReleaseSigning=true` before producing anything for testers or stores.
