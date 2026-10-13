# Android packaging

JalRakshak keeps the existing TanStack Start SSR website and adds a separate
static client build for Capacitor. This avoids changing the production website
architecture while giving Android a real local `index.html` and bundled assets.

## Architecture

- Website build: `npm run build`
  - Uses `vite.config.ts` and the existing `@lovable.dev/vite-tanstack-config`
    TanStack Start SSR pipeline.
  - Output remains `.output/`.
- Android build: `npm run build:mobile`
  - Uses `vite.mobile.config.ts`.
  - Entry point: `mobile/index.html` and `src/mobile.tsx`.
  - Reuses the existing route tree, React components, styles, API client, and
    generated route modules.
  - Output: `mobile-dist/index.html` plus `mobile-dist/assets/`.
- Capacitor:
  - App name: `JalRakshak`
  - Application ID: `np.jalrakshak.app`
  - `webDir`: `mobile-dist`

The mobile router uses TanStack Router hash history. This is intentional:
navigation and reloads work from `file://`-style WebView assets without a web
server rewrite for every route. The SSR website continues to use its normal
history behavior.

The current route tree contains no TanStack server functions, loaders, or
actions. Application data is accessed through the existing Flask API client.
Authentication, alerts, maps, emergency reporting, medical concerns, and photo
uploads therefore remain available in the bundled app when the API is reachable.

## Build and sync

From `Frontend\` on Windows:

```powershell
npm install
npm run build                 # existing SSR website
npm run build:mobile          # static Capacitor assets
Test-Path .\mobile-dist\index.html
npx cap sync android
npx cap doctor
```

The sync command copies the mobile build to:

`android\app\src\main\assets\public\index.html`

The combined shortcut is:

```powershell
npm run cap:sync
```

The Android project can then be opened in Android Studio from
`Frontend\android`.

## API and offline behavior

Set `VITE_API_BASE_URL` at mobile build time to the deployed HTTPS Flask API,
for example:

```powershell
$env:VITE_API_BASE_URL = "https://api.example.invalid"
npm run build:mobile
npx cap sync android
```

Do not use `localhost` or `127.0.0.1` for a production APK. A local emulator
requires an emulator-specific address and a physical device requires a
reachable HTTPS development endpoint.

The web/mobile layer currently:

- caches successful API GET responses in local storage;
- preserves the last successful synchronization timestamp;
- serves cached lists when a later request fails;
- checks cached verified, non-demo hazard reports locally for foreground proximity warnings;
- requests Android coarse/fine location permission through the Capacitor WebView when the user enables proximity alerts;
- saves offline emergency requests, including photo evidence as a local data
  URL;
- labels queued requests as not yet delivered to rescue teams.

Cached data is not a live alert channel. It can be stale, expired, withdrawn, or
unavailable. Newly issued server alerts cannot arrive without a communication
channel. Proximity monitoring and its sound warning are foreground-only; there
is no background location permission, native geofence, or tested alert delivery
when the app is closed or the device is locked.

## Current validation and remaining blockers

Verified in this environment:

- `npm run build` succeeds for the existing SSR website.
- `npm run build:mobile` succeeds and creates `mobile-dist/index.html`.
- `npx cap sync android` succeeds.
- `npx cap doctor` reports Android is healthy.
- `webDir` is `mobile-dist`, and the synced entry point is
  `android/app/src/main/assets/public/index.html`.
- Gradle wrapper files exist, including `android/gradlew.bat` and
  `android/gradle/wrapper/gradle-wrapper.jar`.
- The application ID is `np.jalrakshak.app` in both Capacitor and
  `android/app/build.gradle`.
- Frontend tests pass.
- Backend API regression tests pass.

Native APK compilation has not been claimed. The exact local blockers are:

- `JAVA_HOME` is unset and no `java` command is on `PATH`.
- The wrapper is configured for Gradle `8.14.3`.
- The Android Gradle Plugin is `8.13.0`; use a JDK 17 or newer installation
  supported by that AGP release.
- `compileSdkVersion` and `targetSdkVersion` are `36`, but the local SDK does
  not currently have the Android 36 platform installed.
- The local SDK directory exists at
  `%LOCALAPPDATA%\Android\Sdk`, but `platform-tools\adb.exe` is missing.
- `android/local.properties` is not present. Android Studio or the SDK setup
  creates it locally; it should not be committed.

Install Android Studio with a JDK 17+ and the Android SDK Platform 36,
Android SDK Build-Tools 36.0.0, and Android SDK Platform-Tools. Then either
open `Frontend\android` in Android Studio or set the SDK path explicitly:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:Path"
```

If the SDK command-line tools are installed, the missing SDK components can
be installed with:

```powershell
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"
```

Then prepare and build the debug APK:

```powershell
cd Frontend
npm run build:mobile
npx cap sync android
.\gradlew.bat assembleDebug
```

The expected APK will be under:

`Frontend\android\app\build\outputs\apk\debug\app-debug.apk`

After connecting an emulator or device and confirming `adb devices` lists it,
install the APK with:

```powershell
adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
```

Native geofencing, WorkManager synchronization, and notification channels
remain intentionally pending until the Android project can be compiled and
tested on an emulator or device. The foreground WebView location permission is
declared, but the Android APK and its runtime permission flow have not been
tested on an emulator or device. Frontend static packaging does not provide
background alert guarantees.
