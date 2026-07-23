require('dotenv/config');
const withGoogleMobileAds = require('./plugins/withGoogleMobileAds');
// Requiring this directly (and passing the .default function itself into `plugins` below,
// not a string) sidesteps the exact class of failure the AdMob plugin hit -- no name-based
// module resolution happens for this plugin at all. Confirmed this package's app.plugin.js
// requires cleanly in plain Node before wiring it in this way.
const SentryExpoPlugin = require('@sentry/react-native/app.plugin.js').default;

module.exports = ({ config }) => ({
  ...config,
  name: 'SiteSpark',
  slug: 'sitespark',
  scheme: 'sitespark',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],
  // App Store icon -- Apple requires this fully opaque (no transparency), which is exactly
  // what assets/icon.png is (the SiteSpark logo on its real white background).
  icon: './assets/icon.png',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.sitespark.app',
    usesAppleSignIn: true,
    infoPlist: {
      // Accurate: this app only ever uses standard HTTPS/TLS, no custom/proprietary
      // encryption -- declaring this upfront skips Apple's export-compliance questionnaire
      // on every future submission.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.sitespark.app',
  },
  web: {
    bundler: 'metro',
  },
  // Real Web Push config (expo-notifications supports web via the browser Push API + a
  // service worker, not just native APNs/FCM) -- vapidPublicKey authenticates this app's
  // push subscriptions with the browser's push service, matching a private key registered
  // with Expo's push service (see ROADMAP.md's "Web push notifications" setup section for
  // the one-time command). serviceWorkerPath points at public/expo-service-worker.js,
  // which Metro's web export copies verbatim into dist/ at build time.
  notification: {
    vapidPublicKey: 'BOwPw-VSAiYdMqqeSwegRwrMjkP_AUSLbB3mWvnjq9URcS1UHyzq4uOcbsE3fPUYDEqyKQj9JcR5ze2YaXTCa2k',
    serviceWorkerPath: '/expo-service-worker.js',
  },
  plugins: [
    'expo-font',
    'expo-asset',
    [
      'expo-image-picker',
      {
        photosPermission: 'SiteSpark needs access to your photos so you can add images to your site.',
      },
    ],
    'expo-apple-authentication',
    'expo-web-browser',
    'expo-video',
    'expo-audio',
    'expo-iap',
    'expo-localization',
    [
      'expo-notifications',
      {
        // Shown briefly on Android when a notification arrives -- iOS uses the app icon.
      },
    ],
    [
      'expo-splash-screen',
      {
        // The same SiteSpark logo as the App Store icon, but with its white background
        // removed (assets/splash-icon.png) so it floats on the splash screen's own
        // background color instead of showing a white box around it.
        image: './assets/splash-icon.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#0B1220',
      },
    ],
    [
      // A local plugin (plugins/withGoogleMobileAds.js) that reimplements
      // react-native-google-mobile-ads' own config plugin, instead of referencing that
      // package's plugin at all -- see that file's header comment for the full story.
      // Passing the actual function here (not a string) means Expo never has to resolve
      // anything by name for this plugin; it just runs the function we already required
      // ourselves in plain Node, above.
      withGoogleMobileAds,
      {
        // Real AdMob App ID (from admob.google.com) -- used once for the whole app
        // regardless of which ad formats are active. Rewarded interstitial credits
        // (src/services/rewardedAd.ts), the banner on the Projects screen
        // (src/components/AdBanner.tsx), and app-open ads on foreground resume
        // (src/services/appOpenAd.ts) are all wired to real ad units.
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || 'ca-app-pub-6423632749110820~3428142480',
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713',
      },
    ],
    [
      // Real crash reporting (see src/services/crashReporting.ts) -- this plugin's only job
      // is wiring up native source-map/debug-symbol upload during EAS builds so a crash
      // report shows the actual file/line instead of a minified stack trace. It degrades
      // gracefully (just a build-log warning, never a failure) when organization/project/
      // authToken aren't set, so it's safe to leave in even before a real Sentry project
      // exists -- set SENTRY_ORG, SENTRY_PROJECT, and SENTRY_AUTH_TOKEN as EAS secrets
      // (`eas secret:create`) once one does, never committed here.
      SentryExpoPlugin,
      {},
    ],
  ],
  extra: {
    supportPhone: process.env.SUPPORT_PHONE || '+61 408 680 813',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@buildsitespark.com',
    eas: {
      // Not a secret -- EAS project IDs are meant to live directly in config, which is
      // also the only way `eas build`/`eas submit` can reliably find it, since this file
      // being a dynamic app.config.js (not static app.json) means the EAS CLI can't write
      // to it automatically the way `eas init` normally would.
      projectId: 'bebfca66-0b8b-43c9-98da-bdde6cd12cc8',
    },
  },
});
