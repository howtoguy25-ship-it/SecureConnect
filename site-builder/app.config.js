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
  ],
  extra: {
    supportPhone: process.env.SUPPORT_PHONE || '+61 408 680 813',
    supportEmail: process.env.SUPPORT_EMAIL || 'adisssal7@hotmail.com',
  },
});
