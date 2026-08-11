module.exports = () => {
  return {
    expo: {
      name: "Pryvo",
      slug: "secure-connect",
      version: "1.0.5",
      orientation: "default",
      icon: "./assets/images/icon.png",
      scheme: "secureconnect",
      userInterfaceStyle: "automatic",
      newArchEnabled: true,
      ios: {
        supportsTablet: true,
        requireFullScreen: false,
        buildNumber: "110",
        bundleIdentifier: "com.adham.salameh.secureconnectchat",
        icon: "./assets/images/icon.png",
        privacyManifests: {
          NSPrivacyAccessedAPITypes: [],
        },
        infoPlist: {
          UIDeviceFamily: [1, 2],
          MinimumOSVersion: "16.0",
          UIRequiresFullScreen: false,
          UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
          "UISupportedInterfaceOrientations~ipad": [
            "UIInterfaceOrientationPortrait",
            "UIInterfaceOrientationPortraitUpsideDown",
            "UIInterfaceOrientationLandscapeLeft",
            "UIInterfaceOrientationLandscapeRight",
          ],
          NSCameraUsageDescription: "Pryvo needs camera access for video calls and photos",
          NSMicrophoneUsageDescription: "Pryvo needs microphone access for voice and video calls",
          NSPhotoLibraryUsageDescription: "Pryvo needs photo library access to share photos",
          NSPhotoLibraryAddUsageDescription: "Pryvo saves photos and videos you receive in chats to your photo library when you tap save.",
          NSContactsUsageDescription: "Pryvo uses your contacts to let you start chats and calls with people you already know. Your contacts stay on your device and are never uploaded.",
          NSLocationWhenInUseUsageDescription: "Pryvo uses your location only when you tap Share Location in a chat, so the friend you're messaging can see where you are.",
          NSUserTrackingUsageDescription: "Your data will be used to deliver ads that are more relevant to you. Pryvo shares your device identifier with ad partners only if you allow tracking.",
          // App Store Guideline 2.5.4: only declare background modes we actually implement.
          // We rely on standard remote notifications + foreground signaling for calls.
          // CallKit/PushKit (true VoIP) will be added in a future native dev build.
          UIBackgroundModes: ["audio", "remote-notification"],
          // Pryvo uses standard encryption (Signal Protocol X3DH + Double Ratchet for
          // messages, X25519+HKDF for LiveKit call-frame E2EE) that qualifies for the
          // §740.17(b)(1) mass-market exemption under U.S. Export Administration
          // Regulations (Category 5 Part 2). Per Apple's flow, "qualifies for an
          // exemption" === set this to FALSE — that tells Apple no BIS classification
          // docs are needed. Setting TRUE means "non-exempt" and triggers Apple's
          // "App Encryption Documentation" upload requirement (BIS annual self-class
          // report). Same path Signal/WhatsApp/Telegram use. (Build 64 correction —
          // builds 62/63 wrongly set true + tried to claim exemption, which is a
          // contradiction and triggered error 90592 on TestFlight upload.)
          ITSAppUsesNonExemptEncryption: false,
        },
      },
      android: {
        adaptiveIcon: {
          backgroundColor: "#0D0A1A",
          foregroundImage: "./assets/images/icon.png",
        },
        package: "com.securechat.app",
        edgeToEdgeEnabled: true,
        predictiveBackGestureEnabled: false,
        permissions: [
          "android.permission.CAMERA",
          "android.permission.RECORD_AUDIO",
          "android.permission.READ_CONTACTS",
          "android.permission.ACCESS_FINE_LOCATION",
          "android.permission.ACCESS_COARSE_LOCATION",
          "android.permission.READ_EXTERNAL_STORAGE",
          "android.permission.WRITE_EXTERNAL_STORAGE",
          "android.permission.WRITE_CONTACTS",
        ],
      },
      web: {
        output: "single",
        favicon: "./assets/images/favicon.png",
      },
      plugins: [
        "react-native-iap",
        [
          "expo-build-properties",
          {
            android: {
              kotlinVersion: "2.2.0",
            },
            ios: {
              deploymentTarget: "16.0",
            },
          },
        ],
        [
          "expo-splash-screen",
          {
            image: "./assets/images/splash-icon.png",
            imageWidth: 280,
            resizeMode: "contain",
            backgroundColor: "#0D0A1A",
            dark: {
              backgroundColor: "#0D0A1A",
            },
          },
        ],
        "expo-web-browser",
        [
          "expo-tracking-transparency",
          {
            userTrackingPermission: "Your data will be used to deliver ads that are more relevant to you. Pryvo shares your device identifier with ad partners only if you allow tracking.",
          },
        ],
        [
          "expo-camera",
          {
            cameraPermission: "Pryvo needs camera access for video calls and optional Peek Detection (spotting when someone else may be looking at your screen)",
            microphonePermission: "Pryvo needs microphone access for calls",
            recordAudioAndroid: true,
          },
        ],
        [
          "expo-location",
          {
            locationAlwaysAndWhenInUsePermission: "Pryvo needs location access to share your location with friends",
          },
        ],
        [
          "expo-contacts",
          {
            contactsPermission: "Pryvo needs contacts access to find your friends",
          },
        ],
        [
          "expo-image-picker",
          {
            photosPermission: "Pryvo needs photo library access to share photos",
          },
        ],
        [
          "expo-notifications",
          {
            icon: "./assets/images/icon.png",
            color: "#007AFF",
            sounds: [
              "./assets/sounds/notification.wav",
              "./assets/sounds/ringtone.wav",
            ],
          },
        ],
        [
          "react-native-google-mobile-ads",
          {
            // TODO(admob-android): no Android app is registered in AdMob yet — this
            // value is actually the iOS App ID being reused. Register an Android app
            // in AdMob → Apps → Add app → Android (bundle id com.securechat.app) and
            // paste the resulting ca-app-pub-…~XXX value here. Until then, Android
            // builds will silently fail to load ads.
            androidAppId: "ca-app-pub-6423632749110820~9916919786",
            iosAppId: "ca-app-pub-6423632749110820~9916919786",
            userTrackingUsageDescription: "Your data will be used to deliver ads that are more relevant to you. Pryvo shares your device identifier with ad partners only if you allow tracking.",
            skAdNetworkItems: [
              "cstr6suwn9.skadnetwork",
              "4fzdc2evr5.skadnetwork",
              "4pfyvq9l8r.skadnetwork",
              "2fnua5tdw4.skadnetwork",
              "ydx93a7ass.skadnetwork",
              "5a6flpkh64.skadnetwork",
              "p78axxw29g.skadnetwork",
              "v72qych5uu.skadnetwork",
              "ludvb6z3bs.skadnetwork",
              "cp8zw746q7.skadnetwork",
              "3sh42y64q3.skadnetwork",
              "c6k4g5qg8m.skadnetwork",
              "s39g8k73mm.skadnetwork",
              "3qy4746246.skadnetwork",
              "f38h382jlk.skadnetwork",
              "hs6bdukanm.skadnetwork",
              "v4nxqhlyqp.skadnetwork",
              "wzmmz9fp6w.skadnetwork",
              "yclnxrl5pm.skadnetwork",
              "t38b2kh725.skadnetwork",
              "7ug5zh24hu.skadnetwork",
              "9rd848q2bz.skadnetwork",
              "n6fk4nfna4.skadnetwork",
              "kbd757ywx3.skadnetwork",
              "9t245vhmpl.skadnetwork",
              "a2p9lx4jpn.skadnetwork",
              "22mmun2rn5.skadnetwork",
              "4468km3ulz.skadnetwork",
              "2u9pt9hc89.skadnetwork",
              "8s468mfl3y.skadnetwork",
              "klf5c3l5u5.skadnetwork",
              "ppxm28t8ap.skadnetwork",
              "ecpz2srf59.skadnetwork",
              "uw77j35x4d.skadnetwork",
              "pwa73g5rt2.skadnetwork",
              "mlmmfzh3r3.skadnetwork",
              "578prtvx9j.skadnetwork",
              "4dzt52r2t5.skadnetwork",
              "e5fvkxwrpn.skadnetwork",
              "8c4e2ghe7u.skadnetwork",
              "zq492l623r.skadnetwork",
              "3rd42ekr43.skadnetwork",
              "3qcr597p9d.skadnetwork",
            ],
          },
        ],
      ],
      experiments: {
        reactCompiler: true,
        ...(process.env.EXPO_BASE_URL
          ? { baseUrl: process.env.EXPO_BASE_URL }
          : {}),
      },
      updates: {
        enabled: true,
        fallbackToCacheTimeout: 0,
        url: "https://u.expo.dev/1aa05952-d27c-4274-bdec-dc721710646d",
      },
      runtimeVersion: {
        policy: "appVersion",
      },
      extra: {
        eas: {
          projectId: "1aa05952-d27c-4274-bdec-dc721710646d",
        },
        admob: {
          appId: "ca-app-pub-6423632749110820~9916919786",
          bannerAdUnitId: "ca-app-pub-6423632749110820/4920432330",
          rewardedAdUnitId: "ca-app-pub-6423632749110820/5374205390",
          interstitialAdUnitId: "ca-app-pub-6423632749110820/1982589445",
        },
        API_URL: process.env.EXPO_PUBLIC_DOMAIN
          ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
          : "https://pryvoapp.com",
        OWNER_PHONE_NUMBER: process.env.OWNER_PHONE_NUMBER || "",
      },
    },
  };
};
