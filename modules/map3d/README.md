# map3d (local Expo Module)

Real photorealistic 3D satellite view for the mobile app -- the mobile counterpart of the
web app's own 3D satellite feature (`web/src/components/Map3DView.tsx`), built for the same
reason: flat satellite/hybrid map imagery has no real building-height data, so tilting it
warps/squashes the photo. This wraps Google's newer, separate 3D SDKs, which render real
mesh-based 3D terrain and buildings that tilt cleanly instead.

## Platform status

- **Android: implemented** via **Maps 3D SDK for Android** (`com.google.android.gms.maps3d`).
  Stage 1 scope -- camera + live position marker + the active route polyline; no
  traffic-light/speed-camera/alert overlays yet, matching the web build's own staged rollout.
- **iOS: implemented, but higher-risk.** Google's **Maps 3D SDK for iOS** (`GoogleMaps3D`) is
  still **Experimental (pre-GA)** and ships via Swift Package Manager rather than CocoaPods.
  It's bridged in via React Native's own (>=0.75) `spm_dependency` podspec helper -- a real,
  documented mechanism, not a hack -- but that mechanism has a known gotcha: it can work fine
  in the iOS **simulator** while crashing on a **real physical device** if the SPM product
  turns out to be a dynamic framework not linked into the main app target. **Test this on a
  real device via a development build before ever considering it for TestFlight/production.**
  See "iOS-specific risk" below before shipping this to real users.

## Why this needed real native code (unlike most of this app)

This is genuinely native Kotlin/Swift, not a JS-only feature -- Google's 3D SDKs are separate
map components (Android: a lifecycle-bound `Map3DView`/`GoogleMap3D`; iOS: a SwiftUI-native
`Map` from `GoogleMaps3D`) distinct from the classic Maps SDK `react-native-maps` already
uses. **This cannot be tested in Expo Go on either platform** -- it needs a real dev/prod
build every time native code changes.

## Setup steps before this will actually render on a device

1. **Google Cloud Console**: the existing Android and iOS Maps API keys
   (`GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY`, already set for
   `react-native-maps`) are reused here -- but each needs its platform's **"Maps 3D SDK"**
   API enabled for this project (APIs & Services → Library → search "Maps 3D SDK for
   Android" / "Maps 3D SDK for iOS" → Enable), and added to the key's allowed list if API
   restrictions are turned on. Same kind of step as the "Map Tiles API" one the web 3D build
   needed.
2. **Custom dev client / real build required on both platforms**:
   ```
   npx expo prebuild
   eas build --profile development --platform android
   eas build --profile development --platform ios
   ```
3. The Android `<meta-data>` entry and iOS `Info.plist` entry the SDKs each need are injected
   automatically at prebuild time by `plugin/withMap3D.js` (registered in `app.config.js`),
   reusing `GOOGLE_MAPS_ANDROID_API_KEY`/`GOOGLE_MAPS_IOS_API_KEY` -- no new secrets to manage.

## iOS-specific risk (read before shipping to production)

Two compounding risk factors, worth being deliberate about:

1. **Crash-on-device gotcha**: dynamic frameworks pulled in via `spm_dependency` alone aren't
   always copied into the main app target, which can mean "works in the simulator, crashes on
   a real device." If a real-device dev build crashes specifically when this view mounts,
   that's the likely cause -- the fix is adding the SPM package to the main Xcode target
   directly (a further config-plugin change patching the generated Xcode project), which
   wasn't pre-emptively built here since it requires directly editing project file internals
   that are hard to get right without the ability to test them.
2. **SDK itself is pre-GA**: expect real API surface changes are still possible upstream.

Given both, treat this as something to prove out on a development build first, not something
to push straight to TestFlight/App Store.

## A note on how confident this code is

Every method/type name used in `android/` and `ios/` (`Map3DView`, `GoogleMap3D`, `camera {}`
/`Camera(...)`, `flyToOptions {}`, `markerOptions {}`/`Marker3D`, `polylineOptions {}`/
`Polyline`, `Map3DMode`/`MapMode`, the Android lifecycle passthrough requirement, iOS's
`Map(camera:mode:)` SwiftUI binding) was checked against Google's official Maps 3D SDK docs
and, for the SwiftUI hosting pattern specifically, against `expo-modules-core`'s own real
`SwiftUIHostingView.swift` implementation -- not guessed from memory. That said, this was
written without the ability to compile, run, or debug either platform's native code in this
environment -- there is no Android/iOS toolchain available here, so **the first real signal
on whether this actually compiles will be your first `eas build` on each platform**. If it
fails, paste the Gradle/Xcode error back and it can be fixed from that -- native compile
errors are precise and fast to diagnose from a log, unlike the WebGL rendering issues on the
web side that needed screenshots. iOS in particular has the least-confirmed API surface here
(Google's iOS docs are sparser than the Android ones), so expect it to need more rounds.

## Contract

```tsx
import { Map3DView, isMap3DSupported } from "map3d";

<Map3DView
  center={{ latitude, longitude }}
  markerPosition={{ latitude, longitude }}   // optional -- live position dot
  routeCoordinates={[{ latitude, longitude }, ...]}  // optional -- active route line
  mapMode="HYBRID"  // or "SATELLITE"
  onSteadyChange={(isSteady) => ...}  // Android only for now -- fires as tiles finish
                                       // streaming in; no iOS equivalent was confirmed in
                                       // Google's (sparse) iOS docs while writing this
/>
```

`ref` exposes `{ rotate(deltaDeg), tilt(deltaDeg) }` for a future look-around joystick
(the camera-follow/heading-tracking + joystick UI itself isn't wired up on mobile yet --
`MapScreen.tsx` currently just renders a static, non-rotating camera centered on the
device's live position, on both platforms).
