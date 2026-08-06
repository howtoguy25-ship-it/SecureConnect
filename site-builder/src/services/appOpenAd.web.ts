// react-native-google-mobile-ads doesn't bundle for web at all (see
// src/services/rewardedAd.web.ts for why), and there's no real app-open ad concept for a
// browser tab (no app to "resume into") -- both calls are no-ops on web.
export async function preloadAppOpenAd(): Promise<void> {}
export function showAppOpenAdIfAvailable(): void {}
