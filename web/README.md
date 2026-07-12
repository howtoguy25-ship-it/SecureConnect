# TrackLive Web

A browser-based companion to the TrackLive mobile app. Shares the same Firebase
project (`fleettrack-9f894`), so alerts reported here show up in the mobile app and vice
versa. Built with Vite + React + TypeScript, using the Google Maps JavaScript API (the
mobile app's `react-native-maps` doesn't run in a browser).

## What's here vs. the mobile app

Included: live map, current location, nearby alert pins (report / delete-if-owner /
hide-if-not / confirm), destination search with routing, and a live-camera vehicle
detector (tap the 🎥 button) that draws a box around any car/truck/bus/motorcycle in
frame using TensorFlow.js + COCO-SSD.

**About the vehicle detector**: it labels boxes generically as "Vehicle," not "police
car" or "ambulance." COCO-SSD (the pretrained model it runs) only knows generic object
classes — it has no concept of emergency-vehicle subtypes. Actually distinguishing
police/ambulance from a regular car would need a custom-trained model with real
labeled training data, which is a separate, much larger effort.

Not included (phone-only features that don't translate well to a browser tab):
turn-by-turn voice guidance, and the EV Radar *siren* (audio) detection (needs native
audio + TFLite; a browser tab also can't reliably listen in the background once you
switch away from it).

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

From the repo root, run the deploy script — it pulls the latest code, builds, and deploys,
and stops with a clear error at whichever step fails instead of silently deploying stale
code:
```powershell
.\deploy.ps1
```

Or by hand, from the repo root (not this `web/` folder) — this repo's root `firebase.json`
already has a `hosting` block pointing at `web/dist`:
```
cd web && npm run build && cd ..
npx firebase-tools deploy --project fleettrack-9f894 --only hosting
```
Either way publishes to `https://fleettrack-9f894.web.app` (and/or a custom domain if one
is configured in the Firebase console) — a real link anyone can open and use, no app
install required.
