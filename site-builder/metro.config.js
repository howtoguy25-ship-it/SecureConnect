const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Not included by Expo's default config -- without it, Metro never tries `.web.tsx`
// platform-suffixed files when bundling for web, silently falling back to the native
// file instead (confirmed: RecaptchaVerifierModal.web.tsx was being ignored for web
// builds, pulling in react-native-webview's broken web fallback).
config.resolver.platforms = ['ios', 'android', 'web', 'tvos', 'macos'];

// `firebase/functions/` is a separate, server-only Node.js project (Cloud Functions --
// deployed via `firebase deploy`, never bundled into the app) with its own `node_modules`
// full of Node-only packages (firebase-admin, google-gax, gcp-metadata, etc). Without this,
// Metro's file crawler walks into it anyway and tries to bundle those packages into the
// app itself, which fails at runtime in ways that look nothing like their real cause (e.g.
// "Class extends value undefined is not a constructor" from a Node-only EventEmitter
// subclass deep inside google-logging-utils). `[\\/]` matches both `/` and `\` so this
// works the same on Windows as on macOS/Linux.
config.resolver.blockList = [/firebase[\\/].*/];

module.exports = config;
