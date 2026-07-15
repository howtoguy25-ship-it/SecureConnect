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
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0B1220",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.trackline.navigate",
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
      },
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
      "expo-status-bar",
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
      [
        "./modules/map3d/plugin/withMap3D.js",
        {
          androidApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
          iosApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
        },
      ],
      "./modules/map3d/plugin/withGoogleMaps3DSignatureFix.js",
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
