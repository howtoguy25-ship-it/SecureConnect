require('dotenv/config');

module.exports = ({ config }) => ({
  ...config,
  name: 'SiteForge',
  slug: 'siteforge',
  scheme: 'siteforge',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.siteforge.app',
    usesAppleSignIn: true,
  },
  android: {
    package: 'com.siteforge.app',
  },
  web: {
    bundler: 'metro',
  },
  plugins: [
    [
      'expo-image-picker',
      {
        photosPermission: 'SiteForge needs access to your photos so you can add images to your site.',
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
