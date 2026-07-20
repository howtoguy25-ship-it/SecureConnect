// No mobile ad SDK exists for a browser tab, and react-native-google-mobile-ads doesn't
// even bundle for web at all (see src/services/rewardedAd.web.ts for why) -- render
// nothing rather than breaking the web export.
export default function AdBanner() {
  return null;
}
