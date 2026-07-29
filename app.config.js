require("dotenv/config");

/** @type {import('@expo/config-types').ExpoConfig} */
module.exports = {
  expo: {
    name: "TrackLine",
    slug: "trackline",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],
    ios: {
      // Phone-only -- TrackLine is a live driving/navigation app, not something meant to run
      // on an iPad mounted somewhere, and this avoids App Store Connect requiring a whole
      // separate set of iPad screenshots for a form factor the app isn't really designed for.
      supportsTablet: false,
      bundleIdentifier: "com.trackline.navigate",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "TrackLine uses your location to show your position on the map and provide turn-by-turn navigation.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "TrackLine can track your location in the background to keep navigation and nearby-alert notifications accurate.",
        NSMicrophoneUsageDescription:
          "TrackLine listens for emergency vehicle sirens near you. Audio is analyzed on-device in real time and is never recorded or stored.",
        NSCameraUsageDescription:
          "TrackLine uses your camera for live AI Vehicle Detection, analyzed on-device in real time. Video is never recorded or stored.",
        UIBackgroundModes: ["audio", "location", "fetch"],
        // App only uses standard HTTPS/TLS (Firebase, Google Maps, AdMob) -- no custom
        // encryption -- so it qualifies as exempt. Declaring this here answers Apple's
        // export-compliance question automatically on every build/submit instead of
        // App Store Connect prompting for it by hand each time.
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0B1220",
      },
      package: "com.trackline.navigate",
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "RECORD_AUDIO",
        "CAMERA",
        "FOREGROUND_SERVICE",
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      },
    },
    plugins: [
      "expo-font",
      "expo-asset",
      "expo-tracking-transparency",
      // expo-splash-screen's own plugin, not the legacy top-level `splash` config field --
      // that legacy field left Android's actual splashscreen_background color resource
      // hardcoded to white regardless of what backgroundColor was set to (confirmed by
      // inspecting the generated android/app/src/main/res/values/colors.xml), so the logo
      // always showed on a white box instead of this color. This plugin properly treats the
      // image as a centered icon over a real background color on both platforms, so the
      // transparent-cutout logo (assets/logo-transparent.png, background removed from the
      // original opaque icon.png) sits cleanly on the color with no box/seam around it.
      [
        "expo-splash-screen",
        {
          image: "./assets/logo-transparent.png",
          resizeMode: "contain",
          backgroundColor: "#0B1220",
          imageWidth: 200,
        },
      ],
      "expo-status-bar",
      // Deliberately using react-native-maps' own config plugin here instead of the old
      // `ios.config.googleMapsApiKey` field -- that field triggers a legacy, unmaintained
      // plugin bundled in @expo/config-plugins (node_modules/@expo/config-plugins/build/
      // ios/Maps.js) that injects `pod 'react-native-google-maps', ...` into the Podfile, a
      // pod name that hasn't existed since old react-native-maps versions -- current
      // react-native-maps (1.x) ships its own plugin that correctly adds
      // `pod 'react-native-maps/Google', ...` (a real subspec) instead. Real error this was
      // causing: "[!] No podspec found for `react-native-google-maps`" failing `pod install`.
      [
        "react-native-maps",
        {
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "TrackLine uses your location for live navigation and to show/report nearby alerts.",
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission:
            "TrackLine listens for emergency vehicle sirens near you. Audio is analyzed on-device only and is never recorded or stored.",
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "TrackLine uses your camera for live AI Vehicle Detection, analyzed on-device in real time. Video is never recorded or stored.",
        },
      ],
      // On-device (Google ML Kit) text recognition for the plate-number display in Live
      // Vehicle Detection -- runs entirely on-device, no network call, no cloud API, nothing
      // stored, matching the same privacy shape as the web app's Tesseract-based plate OCR
      // (see web/src/services/plateOcr.ts). Bundled models only (ocrUseBundled) so there's no
      // separate on-first-use model download. `ocrModels: ["latin"]` -- the default (no
      // ocrModels set) bundles all five script models (Chinese/Japanese/Korean/Devanagari
      // too), which just adds app size/build weight with nothing an AU plate would ever use.
      ["rn-mlkit-ocr", { ocrModels: ["latin"], ocrUseBundled: true }],
      [
        "./modules/map3d/plugin/withMap3D.js",
        {
          androidApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
          iosApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
        },
      ],
      "./modules/map3d/plugin/withGoogleMaps3DSignatureFix.js",
      // Only uploads debug symbols/source maps during EAS builds once org/project/authToken
      // are set (from sentry.io -- Settings -> Auth Tokens for the token) -- harmless no-op
      // config without them, Sentry.init() below still works and reports crashes either way,
      // just with unsymbolicated (minified) JS stack traces until these are filled in.
      [
        "@sentry/react-native",
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        },
      ],
      [
        "react-native-google-mobile-ads",
        {
          // Google's own public test App IDs as the fallback -- real Google Mobile Ads
          // account App IDs (format ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY, from
          // admob.google.com -> Apps -> App settings) override via env vars once set up.
          // Ads work out of the box with real (Google-served) test ads either way.
          androidAppId: process.env.ADMOB_ANDROID_APP_ID || "ca-app-pub-3940256099942544~3347511713",
          iosAppId: process.env.ADMOB_IOS_APP_ID || "ca-app-pub-3940256099942544~1458002511",
          userTrackingUsageDescription:
            "TrackLine shows ads to help keep the app free. Allowing tracking lets those ads be more relevant -- you can decline and the app works the same either way.",
        },
      ],
    ],
    extra: {
      googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
      googleDirectionsApiKey: process.env.GOOGLE_DIRECTIONS_API_KEY,
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      admobBannerAndroidUnitId: process.env.ADMOB_ANDROID_BANNER_UNIT_ID,
      admobBannerIosUnitId: process.env.ADMOB_IOS_BANNER_UNIT_ID,
      admobAppOpenAndroidUnitId: process.env.ADMOB_ANDROID_APP_OPEN_UNIT_ID,
      admobAppOpenIosUnitId: process.env.ADMOB_IOS_APP_OPEN_UNIT_ID,
      sentryDsn: process.env.SENTRY_DSN,
      eas: {
        // Not a secret -- EAS project IDs are meant to live directly in config, which is
        // also the only way `eas build`/`eas submit` can reliably find it, since this file
        // being a dynamic app.config.js (not static app.json) means the EAS CLI can't write
        // to it automatically the way `eas init` normally would.
        projectId: "dd1665d0-24fa-41ce-99d8-d94adf93788d",
      },
    },
  },
};
