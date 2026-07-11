# SecureConnect — Navigation + Emergency Vehicle Alert App

Waze-style live navigation with turn-by-turn voice guidance, on-device emergency-vehicle
siren detection ("EV Radar"), and community hazard alerts.

## Stack

- React Native + Expo (SDK 51, TypeScript)
- `react-native-maps` (Google provider) + Google Directions API for routing
- `expo-speech` for on-device turn-by-turn voice guidance
- Firebase Firestore for real-time community alerts, Firebase Auth (anonymous) for
  per-device identity, Cloud Functions for expired-alert cleanup
- A local Expo Module (`modules/yamnet-siren`) wrapping Google's pretrained YAMNet
  TFLite model for siren classification

There's also a browser companion app in `web/` (Vite + React + Google Maps JS API,
sharing the same Firebase backend) — see `web/README.md`. It covers the map/alerts/
routing experience but not voice guidance or siren detection; see that README for why.

## Project layout

```
App.tsx                       Provider tree + root navigator mount
src/
  config/env.ts                Reads API keys from app.config.js "extra"
  context/                     Auth, Location, Settings React contexts
  services/
    firebase.ts                 Firebase app/auth/firestore init (anonymous sign-in)
    directions.ts                Google Directions API client + step parsing
    places.ts                    Google Places Autocomplete + details
    navigationGuidance.ts        GPS-vs-route-step matching for voice triggers
    voice.ts                     expo-speech wrapper, persisted mute state
    alerts.ts                    Firestore alert CRUD + geohash-bounded nearby queries
    userProfile.ts               Syncs alert radius to users/{uid} profile doc
    settings.ts                  AsyncStorage-backed app settings
    sirenDetection.ts            Rolling-buffer mic capture -> YAMNet classifier loop
  native/yamnetNative.ts        JS-side contract for the native YAMNet module
  components/                   MuteButton, AlertMarker, AlertBanner, search bar, nav card
  screens/
    MapScreen.tsx                Home screen: map, search, nav card, alerts, FAB (Phases 1,2,4,5,6)
    AlertReportSheet.tsx         "Keep & Share" bottom sheet (Phase 4)
    AlertDetailSheet.tsx         Alert detail + delete/hide (Phase 5)
    SettingsScreen.tsx           Radius/sensitivity/auto-share/voice defaults (Phase 7)
  navigation/RootNavigator.tsx
  utils/geo.ts                  Geohash encode + 9-cell query bounds + haversine distance
  utils/polyline.ts             Google polyline decoding
modules/yamnet-siren/          Local Expo Module scaffold for on-device siren classification
firebase/
  firestore.rules               Alert ownership rules (delete-if-owner, hide-if-not)
  firestore.indexes.json
  functions/                    Scheduled cleanup of expired alerts + create-time validation
```

The spec's "Search/Destination" and "Active Navigation" screens are implemented as
overlays on `MapScreen` (search bar pre-route, instruction card mid-route) rather than
separate stack screens — that's what the Phase 1/2 build prompts actually construct, and
it avoids a jarring navigation transition mid-route, matching Waze's own UX.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - A Google Maps/Places/Directions API key (or separate restricted keys per API — see
     `.env.example` for which var maps to which restriction)
   - Your Firebase project's web app config (Project Settings → General → Your apps)
3. `npx expo start` — the map, search, routing, voice guidance, and community alerts all
   work in Expo Go once those keys are set (`getNearbyAlerts`/`subscribeNearbyAlerts`
   need a live Firestore project with `firestore.rules` deployed).
4. Deploy Firebase pieces:
   ```
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```

## EV Radar (siren detection) needs a dev build

Phase 6 requires native TFLite bindings, which **do not run in Expo Go**. Before it will
detect anything:

```
npx expo install expo-dev-client
npx expo prebuild
eas build --profile development --platform ios      # and/or android
```

Then follow `modules/yamnet-siren/README.md` to download YAMNet's pretrained
`yamnet.tflite` + class map from TensorFlow Hub and fill in the native
Kotlin/Swift classify() implementations. Until that's done, `sirenDetection.start()`
detects the missing native module and no-ops with a console warning — every other
feature works normally without it.

`autoShareDetections` (Settings → EV Radar) defaults to **off**: a confirmed siren
detection only posts your location as a community alert if you've explicitly opted in.

## Data model

`alerts/{id}`: `type`, `lat`, `lng`, `geohash`, `createdBy`, `createdAt`, `expiresAt`,
`confirmCount`, `hiddenBy[]`. TTL by type: police/emergency_vehicle 45min, hazard/crash
2hr, camera 24hr — enforced client-side at write time and swept server-side every 15min
by `cleanupExpiredAlerts`.

**Ownership rule**, enforced in both the client (`AlertDetailSheet`) and
`firestore.rules`: the creator can delete their alert outright (`deleteAlert`, gone for
everyone); anyone else can only hide it from their own view (`hideAlertForUser`, adds
their uid to `hiddenBy`, doc stays live for everyone else).

## Known gaps for a production build

- No account system yet — every install signs in anonymously via Firebase Auth, so a
  fresh install loses "my alerts" ownership of anything reported before it.
- `modules/yamnet-siren`'s native Kotlin/Swift files are a wired scaffold, not a
  compiled classifier — see the setup steps above.
- `getNearbyAlerts`/`subscribeNearbyAlerts` query a 3x3 geohash-cell neighborhood sized
  to the radius and then apply an exact haversine filter; at very large radii (near the
  15km max) this does a few more Firestore reads than a tighter geo-index would, which
  is an acceptable tradeoff for v1 given alerts self-expire and stay a small collection.
