// Local Expo Config Plugin: injects the platform-specific API key configuration the Maps 3D
// SDK needs on each platform, separate from the classic Maps SDK's own key handling
// (Expo's built-in android.config.googleMaps.apiKey / ios.config.googleMapsApiKey already
// cover that). Reuses the same Maps API keys already used everywhere else in this app (see
// app.config.js) rather than requiring new, separately-managed keys -- Google Maps Platform
// keys are scoped by which APIs are enabled/allowed for that key in Cloud Console, not by
// which meta-data tag/Info.plist entry references them.
//
// Android: a real AndroidManifest <meta-data> tag, mirroring react-native-maps' own
// withMapsAndroid plugin (see node_modules/react-native-maps/plugin/build/android.js).
//
// iOS: Google's SDK docs show the key being set in Swift code (`Map.apiKey = "..."`), not
// via Info.plist -- there's no first-party Info.plist key name for it. This plugin injects
// the value into Info.plist under a key this module's own Swift code reads at runtime
// (ExpoMap3DView.swift), which is the only way to get an env-var-driven value from
// app.config.js into compiled Swift without hardcoding it.
const { withAndroidManifest, withInfoPlist, AndroidConfig } = require("expo/config-plugins");

const ANDROID_META_DATA_KEY = "com.google.android.geo.maps3d.API_KEY";
const IOS_INFO_PLIST_KEY = "GMSApiKey3D";

function withMap3D(config, { androidApiKey, iosApiKey } = {}) {
  config = withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (androidApiKey) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(mainApplication, ANDROID_META_DATA_KEY, androidApiKey);
    } else {
      AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(mainApplication, ANDROID_META_DATA_KEY);
    }
    return config;
  });

  config = withInfoPlist(config, (config) => {
    if (iosApiKey) {
      config.modResults[IOS_INFO_PLIST_KEY] = iosApiKey;
    } else {
      delete config.modResults[IOS_INFO_PLIST_KEY];
    }
    return config;
  });

  return config;
}

module.exports = withMap3D;
