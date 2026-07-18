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
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.sitespark.app',
    usesAppleSignIn: true,
  },
  android: {
    package: 'com.sitespark.app',
  },
  web: {
    bundler: 'metro',
  },
  plugins: [
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
