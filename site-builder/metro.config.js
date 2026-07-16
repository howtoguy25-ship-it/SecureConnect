const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Not included by Expo's default config -- without it, Metro never tries `.web.tsx`
// platform-suffixed files when bundling for web, silently falling back to the native
// file instead (confirmed: RecaptchaVerifierModal.web.tsx was being ignored for web
// builds, pulling in react-native-webview's broken web fallback).
config.resolver.platforms = ['ios', 'android', 'web', 'tvos', 'macos'];

module.exports = config;
