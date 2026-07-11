# SecureConnect Web

A browser-based companion to the SecureConnect mobile app. Shares the same Firebase
project (`fleettrack-9f894`), so alerts reported here show up in the mobile app and vice
versa. Built with Vite + React + TypeScript, using the Google Maps JavaScript API (the
mobile app's `react-native-maps` doesn't run in a browser).

## What's here vs. the mobile app

Included: live map, current location, nearby alert pins (report / delete-if-owner /
hide-if-not / confirm), destination search with routing.

Not included (phone-only features that don't translate well to a browser tab):
turn-by-turn voice guidance, and the EV Radar siren detection (needs native audio +
TFLite; a browser tab also can't reliably listen in the background once you switch
away from it).

## Setup

```
cd web
npm install
cp .env.example .env.local
```

Fill in `.env.local`:
- `VITE_GOOGLE_MAPS_API_KEY` — same Google Maps key as the mobile app, but it also needs
  the **Maps JavaScript API** enabled (not just Maps SDK for Android/iOS) in Google Cloud
  Console for this project.
- The `VITE_FIREBASE_*` values — same as the mobile app's `.env` (`fleettrack-9f894`'s
  web app config).

Run it locally:
```
npm run dev
```
Opens on `http://localhost:5173`.

## Deploy

This repo's root `firebase.json` already has a `hosting` block pointing at `web/dist`.
From the repo root (not this `web/` folder):
```
cd web && npm run build && cd ..
npx firebase-tools deploy --project fleettrack-9f894 --only hosting
```
That publishes to a `https://fleettrack-9f894.web.app` URL (and/or a custom domain if one
is configured in the Firebase console) — a real link anyone can open and use, no app
install required.
