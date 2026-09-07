# fclan — Mobile Build Runbook (iOS + Android)

App: `mobile-app/` (Expo SDK 53, React Native 0.79, Expo Router, react-native-udp).
Bundle IDs (fclan rebrand, Stage 1):
- iOS: `com.toddyone.fclan`
- Android: `com.toddyone.fclan`
- EAS project: `b5d5990c-7fa9-4b26-8014-86691c06b897` (owner `toddyone`)
- Scheme: `fclan`

## Prereqs (interactive — must be run by the owner)

1. `npm i -g eas-cli` (or `npx eas-cli`)
2. `eas login` (Expo account `toddyone`)
3. Apple Developer: `eas credentials` → iOS distribution cert + provisioning
   profile for `com.toddyone.fclan` (TestFlight for `preview`, App Store for `production`)
4. Google Play: upload key + `eas credentials` for `com.toddyone.fclan`
   (internal track for `preview`, production track for `production`)

Native module note: `react-native-udp` is a native module — **Expo Go
cannot run this app**. Always use dev-client, preview, or production builds.

## Builds

```bash
cd mobile-app

# iOS simulator / Android emulator dev client (no store certs needed)
eas build --profile development --platform ios
eas build --profile development --platform android

# Internal distribution (TestFlight + Play internal track)
eas build --profile preview --platform all

# Store submission
eas build --profile production --platform all
eas submit --platform ios   # TestFlight / App Store
eas submit --platform android
```

`eas.json` already defines `preview` (internal distribution, physical
devices — `ios.simulator: false`) and `production` (autoIncrement).
OTA updates ride the `preview`/`production` channels.

## First-run checklist (on device)

1. Settings → Ingest URL = `https://<fclan-host>` (must be https; empty by
   default since the fclan rebrand — no production bleed).
2. Settings → API key = `gt7_…` key created in web Settings → API keys.
3. Settings → PS5 IP = console LAN address.
4. Capture tab → Start → drive. Points flush every 5s; final flush retries
   on stop (1s/3s). Voice announcements optional (expo-speech).
5. Web dashboard → session appears live (Realtime) → analysis unlocks.

## Known platform constraints (from the April audit)

- Xcode 26.0.1 cannot target iOS 26.3+ devices locally → use EAS cloud
  builds for device testing.
- Android: cleartext HTTP blocked — ingest URL must be https (enforced).
- Background UDP on iOS suspends with the app — keep the app foregrounded
  during capture (keep-awake is enabled in-app).
