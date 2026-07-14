// Local Expo Config Plugin: injects the AndroidManifest <meta-data> entry the Maps 3D SDK
// for Android needs (com.google.android.geo.maps3d.API_KEY), distinct from the classic
// Maps SDK's own "com.google.android.geo.API_KEY" meta-data that Expo's built-in
// android.config.googleMaps.apiKey already handles. Reuses the same Android Maps API key
// already used everywhere else in this app (see app.config.js) rather than requiring a
// second, separately-managed key -- Google Maps Platform keys are scoped by which APIs are
// enabled/allowed for that key in Cloud Console, not by which meta-data tag references them.
//
// Mirrors react-native-maps' own withMapsAndroid plugin (see node_modules/react-native-maps/
// plugin/build/android.js) almost exactly, just for the maps3d-specific key name.
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const MAPS3D_META_DATA_KEY = "com.google.android.geo.maps3d.API_KEY";

function withMap3D(config, { androidApiKey } = {}) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    if (androidApiKey) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        MAPS3D_META_DATA_KEY,
        androidApiKey
      );
    } else {
      AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(mainApplication, MAPS3D_META_DATA_KEY);
    }
    return config;
  });
}

module.exports = withMap3D;
