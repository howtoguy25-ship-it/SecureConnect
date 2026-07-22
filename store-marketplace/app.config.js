require("dotenv/config");

/** @type {import('@expo/config-types').ExpoConfig} */
module.exports = {
  expo: {
    name: "Stockly",
    slug: "stockly",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.stockly.app",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Stockly uses your location to find stores near you and show accurate distances.",
        NSCameraUsageDescription:
          "Stockly uses your camera so store owners can photograph stock, flavors, and menu items to publish.",
        NSPhotoLibraryUsageDescription:
          "Stockly lets store owners pick photos from their library to publish stock, flavors, and menu items.",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#101828",
      },
      package: "com.stockly.app",
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "CAMERA", "READ_MEDIA_IMAGES"],
    },
    plugins: [
      "expo-font",
      [
        "expo-splash-screen",
        {
          image: "./assets/icon.png",
          resizeMode: "contain",
          backgroundColor: "#101828",
          imageWidth: 200,
        },
      ],
      "expo-status-bar",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Stockly uses your location to find stores near you and show accurate distances.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Stockly lets store owners pick photos to publish stock, flavors, and menu items.",
          cameraPermission:
            "Stockly uses your camera so store owners can photograph stock, flavors, and menu items.",
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#101828",
        },
      ],
    ],
    extra: {
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      abrLookupGuid: process.env.ABR_LOOKUP_GUID,
      eas: {
        // Placeholder -- run `eas init` in this directory to generate a real project ID once
        // you're ready to build; the EAS CLI can't write to a dynamic app.config.js for you.
        projectId: "",
      },
    },
  },
};
