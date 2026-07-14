import mobileAds from "react-native-google-mobile-ads";

// Kicks off the Google Mobile Ads SDK's own initialization exactly once, no matter how many
// call sites (App Open manager, banner, any future ad placement) ask for it -- every caller
// awaits the same in-flight/settled promise instead of re-initializing.
let initPromise: Promise<void> | null = null;

export function ensureAdsInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = mobileAds()
      .initialize()
      .then(() => undefined)
      .catch((err) => {
        console.warn("[ads] Google Mobile Ads SDK failed to initialize", err);
      });
  }
  return initPromise;
}
