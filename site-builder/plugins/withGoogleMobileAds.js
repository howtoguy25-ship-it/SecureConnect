// A local re-implementation of react-native-google-mobile-ads' own Expo config plugin
// (node_modules/react-native-google-mobile-ads/plugin/src/index.ts), used instead of
// referencing that package's plugin directly.
//
// Why this exists: Expo's plugin loader resolves a plugin given as a package name by first
// looking for "<package>/app.plugin.js", and falling back to requiring the package's plain
// main entry if that lookup fails. On EAS's build workers that discovery step has been
// failing for this package, and the fallback then requires the package's main JS file in
// bare Node (no Metro/Babel) -- which transitively requires `react-native` itself, whose own
// main entry contains real Flow syntax (`import typeof ... from './index.js.flow'`), valid
// only to Metro's Flow-aware transform. That's the exact "Unexpected token 'typeof'" from the
// build log. Pinning EAS's Node version and pointing directly at the package's app.plugin.js
// both reduced how often this triggers, but the failure kept recurring, which means something
// about how that specific file gets resolved in the EAS Build environment can't be relied on.
//
// This plugin needs none of that: it only ever touches Info.plist / AndroidManifest.xml via
// @expo/config-plugins' own mod helpers, so it has zero dependency on react-native-google-mobile-ads
// itself being requirable at config-read time, or its build being consistent across environments.
// It reads exactly like the official plugin so the app's actual behavior is unchanged.
const { AndroidConfig, withAndroidManifest, withPlugins, withInfoPlist } = require('@expo/config-plugins');

function addReplacingMainApplicationMetaDataItem(manifest, itemName, itemValue) {
  AndroidConfig.Manifest.ensureToolsAvailable(manifest);

  const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  mainApplication['meta-data'] = mainApplication['meta-data'] ?? [];

  const existingItem = mainApplication['meta-data'].find((item) => item.$['android:name'] === itemName);
  if (existingItem) {
    existingItem.$['android:value'] = itemValue;
    existingItem.$['tools:replace'] = 'android:value';
  } else {
    mainApplication['meta-data'].push({
      $: { 'android:name': itemName, 'android:value': itemValue, 'tools:replace': 'android:value' },
    });
  }

  return manifest;
}

const withAndroidAppId = (config, androidAppId) => {
  if (androidAppId === undefined) return config;
  return withAndroidManifest(config, (config) => {
    addReplacingMainApplicationMetaDataItem(config.modResults, 'com.google.android.gms.ads.APPLICATION_ID', androidAppId);
    return config;
  });
};

const withIosAppId = (config, iosAppId) => {
  if (iosAppId === undefined) return config;
  return withInfoPlist(config, (config) => {
    config.modResults.GADApplicationIdentifier = iosAppId;
    return config;
  });
};

const withGoogleMobileAds = (config, { androidAppId, iosAppId } = {}) => {
  if (androidAppId === undefined) {
    console.warn("No 'androidAppId' was provided. The native Google Mobile Ads SDK will crash on Android without it.");
  }
  if (iosAppId === undefined) {
    console.warn("No 'iosAppId' was provided. The native Google Mobile Ads SDK will crash on iOS without it.");
  }

  return withPlugins(config, [
    [withAndroidAppId, androidAppId],
    [withIosAppId, iosAppId],
  ]);
};

module.exports = withGoogleMobileAds;
