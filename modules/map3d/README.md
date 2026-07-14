# map3d (local Expo Module)

Real photorealistic 3D satellite view for the mobile app, via Google's **Maps 3D SDK for
Android** (`com.google.android.gms.maps3d`) -- the mobile counterpart of the web app's own
3D satellite feature (`web/src/components/Map3DView.tsx`), built for the same reason: flat
satellite/hybrid map imagery has no real building-height data, so tilting it warps/squashes
the photo. This wraps Google's newer SDK, which renders real mesh-based 3D terrain and
buildings that tilt cleanly instead.

## Platform status

- **Android: implemented** (Stage 1 -- camera + live position marker + the active route
  polyline; no traffic-light/speed-camera/alert overlays yet, matching the web build's own
  staged rollout).
- **iOS: not implemented.** Google's Maps 3D SDK for iOS is still **Experimental (pre-GA)**
  and ships via Swift Package Manager rather than CocoaPods, which doesn't fit Expo's
  CocoaPods-based iOS build pipeline cleanly. Building that integration now risked breaking
  iOS builds entirely for very low reward given the SDK's own immature status. `Map3DView`
  renders nothing on iOS (`isMap3DSupported` is `false` there) -- the existing flat map is
  untouched and keeps working normally.

## Why this needed real native code (unlike most of this app)

This is genuinely native Kotlin, not a JS-only feature -- Google's Maps 3D SDK is a separate
Android View (`Map3DView`/`GoogleMap3D`) with its own lifecycle requirements, distinct from
the classic Maps SDK `react-native-maps` already uses. **This cannot be tested in Expo Go.**

## Setup steps before this will actually render on a device

1. **Google Cloud Console**: the existing Android Maps API key (`GOOGLE_MAPS_ANDROID_API_KEY`,
   already set for `react-native-maps`) is reused here -- but it needs the **"Maps 3D SDK for
   Android"** API enabled for this project, and (if the key has API restrictions turned on)
   that API added to the key's allowed list. Same kind of step as the "Map Tiles API" one the
   web 3D build needed -- APIs & Services → Library → search "Maps 3D SDK for Android" →
   Enable.
2. **Custom dev client / real build required**: this uses native code, so `expo start` alone
   (Expo Go) won't show it. Build with:
   ```
   npx expo prebuild
   eas build --profile development --platform android   # or production, once confirmed working
   ```
3. The AndroidManifest `<meta-data>` entry the SDK needs
   (`com.google.android.geo.maps3d.API_KEY`) is injected automatically at prebuild time by
   `plugin/withMap3D.js` (registered in `app.config.js`), using the same
   `GOOGLE_MAPS_ANDROID_API_KEY` env var as everything else -- no new secret to manage.

## A note on how confident this code is

Every method/class name used in `android/src/main/java/expo/modules/map3d/` (`Map3DView`,
`GoogleMap3D`, `camera {}`, `flyToOptions {}`, `markerOptions {}`, `polylineOptions {}`,
`Map3DMode`, the lifecycle passthrough requirement) was checked against Google's official
Maps 3D SDK for Android documentation before being written, not guessed. That said, this
was written without the ability to compile, run, or debug it in this environment -- there is
no Android/iOS toolchain available here, so **the first real signal on whether this actually
compiles will be your first `eas build`**. If it fails, paste the Gradle error back and it
can be fixed from that -- Kotlin compile errors are precise and fast to diagnose from a log,
unlike the WebGL rendering issues on the web side that needed screenshots.

## Contract

```tsx
import { Map3DView, isMap3DSupported } from "map3d";

<Map3DView
  center={{ latitude, longitude }}
  markerPosition={{ latitude, longitude }}   // optional -- live position dot
  routeCoordinates={[{ latitude, longitude }, ...]}  // optional -- active route line
  mapMode="HYBRID"  // or "SATELLITE"
  onSteadyChange={(isSteady) => ...}  // fires as photorealistic tiles finish streaming in
/>
```

`ref` exposes `{ rotate(deltaDeg), tilt(deltaDeg) }` for a future look-around joystick
(the camera-follow/heading-tracking + joystick UI itself isn't wired up on mobile yet --
`MapScreen.tsx` currently just renders a static, non-rotating camera centered on the
device's live position).
