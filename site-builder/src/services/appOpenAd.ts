import mobileAds, { AppOpenAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

// Real ad unit for "SiteSpark App Open" -- dev/debug builds always use Google's test ad
// unit regardless of env config, same safeguard as the rewarded interstitial and banner
// (see src/services/rewardedAd.ts) against AdMob flagging the account for invalid traffic
// from repeated real-ad requests during testing.
const APP_OPEN_UNIT_ID = __DEV__
  ? TestIds.APP_OPEN
  : process.env.EXPO_PUBLIC_ADMOB_APP_OPEN_UNIT_ID || 'ca-app-pub-6423632749110820/9554567137';

// Google's own guidance: an app open ad older than 4 hours is considered stale inventory
// and shouldn't be shown -- request a fresh one instead.
const AD_FRESHNESS_MS = 4 * 60 * 60 * 1000;

let ad: AppOpenAd | null = null;
let loadedAt = 0;
let isShowingAd = false;
let initialized = false;

function createAndLoad() {
  const next = AppOpenAd.createForAdRequest(APP_OPEN_UNIT_ID, {
    // Matches what was declared in the App Store's Data Collection questionnaire -- no
    // advertising/tracking data collected. Non-personalized ads don't use IDFA, so no App
    // Tracking Transparency prompt is needed either.
    requestNonPersonalizedAdsOnly: true,
  });
  next.addAdEventListener(AdEventType.LOADED, () => {
    loadedAt = Date.now();
  });
  next.addAdEventListener(AdEventType.CLOSED, () => {
    isShowingAd = false;
    // Preload the next one immediately so it's ready well before the next foreground.
    createAndLoad();
  });
  next.addAdEventListener(AdEventType.ERROR, () => {
    isShowingAd = false;
  });
  ad = next;
  next.load();
}

function isAdAvailable(): boolean {
  return !!ad && loadedAt > 0 && Date.now() - loadedAt < AD_FRESHNESS_MS;
}

// Call once, as early as possible (app launch, while the user is signed in) so an ad is
// likely to be ready well before the first time the app is backgrounded and resumed.
export async function preloadAppOpenAd(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await mobileAds().initialize();
  createAndLoad();
}

// Only ever shows an already-loaded, still-fresh ad -- never blocks waiting on a network
// load, since that would delay the user getting back into the app they just reopened.
export function showAppOpenAdIfAvailable(): void {
  if (isShowingAd || !isAdAvailable()) return;
  isShowingAd = true;
  ad!.show().catch(() => {
    isShowingAd = false;
  });
}
