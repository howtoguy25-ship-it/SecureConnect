import { Platform } from "react-native";
import mobileAds from "react-native-google-mobile-ads";
import { requestTrackingPermissionsAsync } from "expo-tracking-transparency";

// Kicks off the Google Mobile Ads SDK's own initialization exactly once, no matter how many
// call sites (App Open manager, banner, any future ad placement) ask for it -- every caller
// awaits the same in-flight/settled promise instead of re-initializing.
let initPromise: Promise<void> | null = null;

export function ensureAdsInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = maybeRequestTrackingPermission()
      .then(() => mobileAds().initialize())
      .then(() => undefined)
      .catch((err) => {
        console.warn("[ads] Google Mobile Ads SDK failed to initialize", err);
      });
  }
  return initPromise;
}

// Real App Tracking Transparency prompt -- this app's Info.plist already declares
// NSUserTrackingUsageDescription (via the react-native-google-mobile-ads plugin config in
// app.config.js), but declaring that string alone doesn't show the prompt; iOS requires an
// actual call to the ATT API before requesting IDFA-based (personalized) ads. Skipping this
// wasn't a hard App Review rejection, but it meant every ad silently fell back to non-
// personalized-only and left a declared-but-unused permission sitting in the app. Android has
// no ATT concept, so this is a no-op there.
async function maybeRequestTrackingPermission(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    await requestTrackingPermissionsAsync();
  } catch (err) {
    console.warn("[ads] tracking permission request failed", err);
  }
}
