import mobileAds, { AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

let initialized = false;
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await mobileAds().initialize();
  initialized = true;
}

// Falls back to Google's public test ad unit (always fills, clearly labeled "Test Ad") until
// a real AdMob account exists -- swap in the real rewarded ad unit id from
// admob.google.com via EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID once you have one.
const REWARDED_UNIT_ID = process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID || TestIds.REWARDED;

// Loads and shows a real rewarded ad, resolving true only if AdMob actually reports the
// user earned the reward (they watched it through) -- never assume completion just because
// show() resolved, since the user can back out of the ad early with no reward fired.
export function showRewardedAd(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    ensureInitialized()
      .then(() => {
        const rewarded = RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
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
