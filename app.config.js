require("dotenv/config");

/** @type {import('@expo/config-types').ExpoConfig} */
module.exports = {
  expo: {
    name: "TrackLive",
    slug: "tracklive",
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
      bundleIdentifier: "com.tracklive.navigate",
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "TrackLive uses your location to show your position on the map and provide turn-by-turn navigation.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "TrackLive can track your location in the background to keep navigation and nearby-alert notifications accurate.",
        NSMicrophoneUsageDescription:
          "TrackLive listens for emergency vehicle sirens near you. Audio is analyzed on-device in real time and is never recorded or stored.",
        UIBackgroundModes: ["audio", "location", "fetch"],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#0B1220",
      },
      package: "com.tracklive.navigate",
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "RECORD_AUDIO",
        "FOREGROUND_SERVICE",
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
        },
      },
    },
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "TrackLive uses your location for live navigation and to show/report nearby alerts.",
        },
      ],
      [
        "expo-av",
        {
          microphonePermission:
            "TrackLive listens for emergency vehicle sirens near you. Audio is analyzed on-device only and is never recorded or stored.",
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
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
  },
};
