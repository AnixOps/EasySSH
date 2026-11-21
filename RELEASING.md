# Releasing

## Versions

Semantic versioning:

- **Patch** `1.0.x`: fixes only. Ship whenever a fix is ready.
- **Minor** `1.x.0`: features. About every four to six weeks.
- **Major** `2.0.0`: only if a saved configuration could no longer be read.
  Configuration changes are additive with defaults, so this should not
  happen; a user must never lose hosts to an upgrade.

## Rules for `main`

- `main` is always releasable. Changes land through pull requests.
- Branch protection requires the CI checks (frontend and screenshots, Rust
  on Windows, macOS and Linux) before merging.
- One feature per pull request, squash-merged, branch deleted afterwards.

## Shipping a version

1. Open a pull request that bumps the version in `Cargo.toml` (workspace),
   `package.json`, `src-tauri/tauri.conf.json`, and the two lockfiles.
2. When CI is green, run the smoke test below on one real machine against a
   real server, using the installers the pull request's CI uploaded
   (`AnixOps-SSH-<OS>` artifacts; CI builds them because the version
   changed, `scripts/ci-changes.sh`). Merging is the release, so test first.
   For a patch release, the checks touching the fix are enough.
3. Merge. `tag.yml` sees the new version on `main`, checks that the three
   files agree, tags the merge commit `vX.Y.Z` and runs `release.yml`, which
   builds the installers on all three platforms, signs macOS when the Apple
   secrets exist ([docs/signing.md](docs/signing.md)), builds the phone apps
   when their secrets exist (see Mobile) and publishes the release. Nobody tags by hand. If a version's tag already exists, nothing
   happens; Actions → Tag release → Run workflow retries a missed run.
4. Watch the issues for a few days. A regression gets a patch release, not a
   revert of the tag.

If a release build fails for an external reason (a download returning 500,
a runner outage), re-run the failed job; do not change the code.

## Smoke test (about ten minutes)

Install the build from the CI run or release, then:

- [ ] The app starts; Settings → SSH environment shows OpenSSH and the agent.
- [ ] Settings → Updates: "Check now" ends with "up to date" (or the newer release, with a working Download) on a build that carries the update key.
- [ ] A host from `~/.ssh/config` and a saved host both open a terminal.
- [ ] A password-only host asks for the password in the terminal.
- [ ] `htop` or `vim` fills the window and follows a resize; Chinese text renders.
- [ ] Ctrl+Shift+C / V copy and paste; Ctrl+Shift+F finds text.
- [ ] `exit`, then Reconnect works.
- [ ] The file pane lists the home folder; upload by drag and drop and a download both finish.
- [ ] On a password-only host the file pane asks in a dialog.
- [ ] A local tunnel turns Running and its port answers; turning it off frees the port.
- [ ] Ctrl+Shift+K finds a host and opens it.
- [ ] Quitting the app leaves no `ssh` or `sftp` processes behind.
- [ ] Windows or macOS: with a passphrase set, enable Windows Hello or Touch ID in Settings, Vault; lock, then unlock with it, and cancel the prompt once (the passphrase still works).
- [ ] Linux, macOS or Windows 11 with a FIDO2 key that has hmac-secret (YubiKey 5, Nitrokey 3, SoloKeys): Settings, Vault, "Add security key" (passphrase, two touches, PIN if set); lock, unlock with the key; add a second key and remove the first; unplug the key and see the "no security key" message; a key without hmac-secret (for example a U2F-only key) is refused with an explanation and nothing is stored.
- [ ] With a USB serial adapter (or a loopback), a saved serial host opens from the new-tab menu, types and echoes; on Linux a port without access shows the `dialout` hint.

## Update feed

Desktop builds tell the user when a newer release exists (Settings → Updates)
and install it when the user presses "Update and restart"
(`src-tauri/src/update_install.rs`): the installer named by the feed is
downloaded, its size, SHA-256 and signature verified, and then the Windows NSIS
installer runs with `/P /R /UPDATE` (passive, restarts the app), the macOS
`.app` from the `.dmg` replaces the running bundle, or the new AppImage replaces
`$APPIMAGE`; `.deb` installs get the release page. The check reads one signed file per platform,
`anixops-ssh-<windows|macos|linux>.appcast.json`, in the `anixops-appcast-v1`
format every AnixOps program uses ([anix-kit](https://github.com/AnixOps/anix-kit),
package `update`). `release.yml` builds and signs the three files after the
installers are uploaded (job `update-feed`, `scripts/build-update-feeds.sh`) and
attaches them to the release, so `releases/latest/download/<file>` serves them
once the release is published. What the app sends is in the README, Privacy.

One-time setup, by the owner:

1. Make the key pair (anix-kit, pinned like the workflow does):

   ```sh
   go run github.com/AnixOps/anix-kit/cmd/anixsign@73de268a2e0909b71ba1e1b80fd3470ae5a54aa9 keygen update-key.pem
   ```

   It writes the private key `update-key.pem` (PKCS#8 PEM, mode 0600) and prints
   the **public key** (base64) and its **key id**. Keep `update-key.pem` offline
   apart from the secret below; nobody needs to see it again.
2. Repository **secret** `ANIXOPS_UPDATE_SIGNING_KEY`: the whole content of
   `update-key.pem`, including the `BEGIN`/`END` lines.
3. Repository **variable** `EASYSSH_UPDATE_PUBLIC_KEYS`: the public key (base64).
   Several keys may be listed, comma separated, to roll a new key out before the
   old one is retired. Release and CI builds compile it in
   (`option_env!`); a build without it never checks for updates, and Settings
   says so and points to the GitHub Releases page.

Behaviour to know:

- Without the secret the release still ships; the job only warns and attaches no
  feed. Installed apps then keep seeing the previous release's feed.
- The feed's `build` is `major*1000000 + minor*1000 + patch` (the number the
  Android versionCode already uses); the app offers an item whose build is
  higher than its own. `sequence` is the unix time of the workflow run, and the
  app refuses a feed with a lower sequence than one it accepted (replay).
- One item per platform, its installer (`*-setup.exe`, `*.dmg`, `*.AppImage`),
  signed with the archive signature, which the in-app installer verifies (size,
  SHA-256 and signature) before opening it. The asset names matter: the
  installer must stay `*-setup.exe` (NSIS, which knows `/P /R /UPDATE`), a
  `.dmg` holding one `.app`, and an `.AppImage`.
- Testing an update end to end: `EASYSSH_UPDATE_LIVE_KEY=<public key> cargo test
  -p easyssh-update --test live_release -- --ignored` fetches the latest Linux
  feed and installer and verifies both. Feeds carry no architecture:
  if a second architecture of a platform is ever shipped, it needs its own
  product name.
- Rotating the key: add the new public key to the variable next to the old one,
  release, then switch the secret to the new private key; drop the old public
  key once nobody runs a build older than that release.
- To re-issue a feed for a published release, re-run the `update-feed` job.

## Mobile

`release.yml` also builds the phone apps, in two jobs that run next to the
desktop build. They are `continue-on-error` and not required by the publish
step, so a mobile problem or a missing secret never blocks or fails the
desktop release. Each job writes a note to its job summary saying what it did.

**Versions.** Nothing extra to bump. Android `versionName` is the app version
and `versionCode` is `major*1000000 + minor*1000 + patch` (Tauri derives both
from `tauri.conf.json`; the job fails if the code ever differs). The iOS job
sets `CFBundleShortVersionString` to the app version and `CFBundleVersion` to
the same integer as the Android `versionCode`. `tag.yml`'s check of the three
version files is unchanged. Both stores reject a version they already have, so
a store upload that went through can only be followed by a patch release.

### Secrets

Repository secrets (Settings → Secrets and variables → Actions). Never commit
any of them.

| Secret | What it is |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The upload keystore (`.jks`), base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | Password of that key |
| `APP_STORE_CONNECT_KEY_ID` | Key ID of the App Store Connect API key |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID shown above the keys list |
| `APP_STORE_CONNECT_KEY_BASE64` | The downloaded `AuthKey_<id>.p8`, base64-encoded |
| `APPLE_TEAM_ID` | 10-character Apple Developer team ID |
| `IOS_CERTIFICATE_BASE64` | Apple Distribution certificate with its private key, exported as `.p12`, base64-encoded |
| `IOS_CERTIFICATE_PASSWORD` | Password chosen when exporting the `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | App Store provisioning profile for `com.anixops.ssh`, base64-encoded |

`EASYSSH_SENTRY_DSN` and `EASYSSH_USAGE_URL` (see
[docs/telemetry.md](docs/telemetry.md)) are passed to the mobile builds too.

Encode a file with `base64 -w0 file` (Linux) or `base64 -i file` (macOS).

### Android

The workflow decodes the keystore to a temporary file and exports its path
and the passwords as `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.
`src-tauri/gen/android/app/build.gradle.kts` creates a `release` signing
config only when all four are present, so a fork, a pull request or a local
build still produces an unsigned release exactly as before.

Create the upload keystore once and keep two copies somewhere safe, outside
the repository:

```
keytool -genkeypair -v -keystore upload.jks -storetype PKCS12 \
  -alias upload -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 upload.jks   # the value of ANDROID_KEYSTORE_BASE64
```

With Play App Signing (required for new apps, and what we use) this is only
the *upload* key: Google holds the key that signs what users install. A lost
or leaked upload key is replaced through Play Console → App integrity → App
signing → Request upload key reset; it does not strand the app.

Output on a tag: `AnixOps-SSH-<version>-android.aab` (for Play) and
`AnixOps-SSH-<version>-android-arm64.apk` (direct download), both signed and
attached to the release. Only arm64 is built, the one Android target CI
proves; an x86 emulator or Chromebook needs a later change. Without the four
Android secrets the job builds an unsigned APK as a workflow artifact
(`AnixOps-SSH-Android-unsigned`) and attaches nothing to the release, because
an unsigned APK cannot be installed and Play rejects an unsigned AAB.

### iOS

With all seven iOS secrets present, the job sets the bundle version, builds an
App Store IPA (`tauri ios build --export-method app-store-connect`) and
uploads it to TestFlight with `xcrun altool`. Without them the job is skipped
with a summary note. Nothing is attached to the GitHub release, since an App
Store IPA only installs through Apple.

App Store Connect API key: App Store Connect → Users and Access →
Integrations → App Store Connect API → Team Keys → generate a key with the
App Manager role. Note the Key ID and the Issuer ID, and download the `.p8`
at once (Apple offers it only once). The certificate is an Apple Distribution
certificate created in the developer portal (Certificates, Identifiers &
Profiles) and exported from Keychain Access as `.p12`; the profile is of type
App Store for the identifier `com.anixops.ssh`.

### One-time manual steps

1. Google Play Console: create the app (`com.anixops.ssh`), accept Play App
   Signing, fill in the store listing from [docs/store/](docs/store/), the
   content rating, the data safety form and the privacy policy URL.
2. Upload the first AAB by hand (Release → Testing or Production → Create new
   release); Play requires the first upload of a new app to be manual. The
   workflow does not upload to Play at all: download the AAB from the GitHub
   release and upload it for every later version too.
3. App Store Connect: register the identifier `com.anixops.ssh` and create the
   app record (My Apps → +) before the first TestFlight upload, or the upload
   is rejected. Fill in the listing and the privacy answers when moving from
   TestFlight to review.
4. Add the secrets above. Until then a release goes out as before, without
   signed mobile builds.

### Mobile smoke test

The phone apps are compiled in CI but have not been run on a device yet.
Before the first store submission, on one real phone: first run and vault
passphrase, biometric unlock, a host opens a terminal and the soft keyboard
and key bar work, the file browser lists and transfers a file, a local
forward answers, and the vault locks after the app goes to the background.
