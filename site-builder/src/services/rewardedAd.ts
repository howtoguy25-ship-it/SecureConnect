import mobileAds, { AdEventType, RewardedInterstitialAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

let initialized = false;
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await mobileAds().initialize();
  initialized = true;
}

// Real ad unit for "SiteSpark Rewarded Credits", created as a Rewarded Interstitial (not a
// plain Rewarded ad unit) in AdMob -- these are two different ad unit types with different
// SDK classes (RewardedInterstitialAd vs RewardedAd); using the wrong one for a given ad
// unit id fails to load.
//
// Dev/debug builds always use Google's test ad unit regardless -- repeatedly requesting the
// real one from a development device risks AdMob flagging the account for invalid traffic.
// Only release builds (__DEV__ false) ever request the real ad.
const REWARDED_UNIT_ID = __DEV__
  ? TestIds.REWARDED_INTERSTITIAL
  : process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID || 'ca-app-pub-6423632749110820/6165986469';

// Loads and shows a real rewarded interstitial ad, resolving true only if AdMob actually
// reports the user earned the reward (they watched it through) -- never assume completion
// just because show() resolved, since the user can back out of the ad early with no reward
// fired. The app still shows its own "Watch an ad for 15 credits" opt-in button before
// calling this, same as a plain Rewarded ad would need, so the user always knows an ad (and
// a reward) is coming rather than one interrupting them unannounced.
export function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ensureInitialized()
      .then(() => {
        const rewarded = RewardedInterstitialAd.createForAdRequest(REWARDED_UNIT_ID, {
          // Matches what was declared in the App Store's Data Collection questionnaire --
          // no advertising/tracking data collected. Non-personalized ads don't use IDFA,
          // so no App Tracking Transparency prompt is needed either.
          requestNonPersonalizedAdsOnly: true,
        });

        let earnedReward = false;
        const cleanup = () => {
          unsubLoaded();
          unsubEarned();
          unsubError();
          unsubClosed();
        };

        const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
          rewarded.show();
        });
        const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earnedReward = true;
        });
        const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, (error) => {
          cleanup();
          reject(error);
        });
        const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
          cleanup();
          resolve(earnedReward);
        });

        rewarded.load();
      })
      .catch(reject);
  });
}
