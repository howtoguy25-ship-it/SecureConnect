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
