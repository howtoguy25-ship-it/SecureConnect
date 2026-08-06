import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// Real ad unit for "SiteSpark Banner" -- dev/debug builds always use Google's test banner
// regardless of env config, same safeguard as the rewarded interstitial (see
// src/services/rewardedAd.ts) against AdMob flagging the account for invalid traffic from
// repeated real-ad requests during testing.
const BANNER_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : process.env.EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID || 'ca-app-pub-6423632749110820/2989158784';

// Anchored adaptive banner -- sizes itself to the device width and AdMob's recommended
// height for that width, rather than a fixed 320x50 that looks cramped on wider phones.
export default function AdBanner() {
  return (
    <View style={styles.wrap}>
      <BannerAd
        unitId={BANNER_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          // Matches what was declared in the App Store's Data Collection questionnaire --
          // no advertising/tracking data collected. Non-personalized ads don't use IDFA,
          // so no App Tracking Transparency prompt is needed either.
          requestNonPersonalizedAdsOnly: true,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', backgroundColor: '#F8FAFC' },
});
