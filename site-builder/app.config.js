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
  ],
  extra: {
    supportPhone: '+61 408 680 813',
    supportEmail: 'adisssal7@hotmail.com',
  },
});
