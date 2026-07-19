require('dotenv/config');

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
