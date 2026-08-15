// react-native-google-mobile-ads bundles native view codegen (GoogleMobileAdsNativeViewNativeComponent)
// that imports react-native internals unavailable on web, which fails the whole web export --
// and there's no real mobile ad SDK for a browser tab anyway. This stub keeps the web build
// working; RewardedAdCard still renders (see its "Could not show ad" catch), it just can't
// actually earn a reward on web.
export function showRewardedAd(): Promise<boolean> {
  return Promise.reject(new Error('Watching ads for credits is only available in the iOS app.'));
}
