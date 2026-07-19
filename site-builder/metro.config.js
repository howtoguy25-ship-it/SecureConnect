const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Not included by Expo's default config -- without it, Metro never tries `.web.tsx`
// platform-suffixed files when bundling for web, silently falling back to the native
// file instead (confirmed: RecaptchaVerifierModal.web.tsx was being ignored for web
// builds, pulling in react-native-webview's broken web fallback).
config.resolver.platforms = ['ios', 'android', 'web', 'tvos', 'macos'];

// This repo's own `firebase/functions/` (this project's Cloud Functions source --
// deployed via `firebase deploy`, never bundled into the app) is a separate, server-only
// Node.js project with its own `node_modules` full of Node-only packages (firebase-admin,
// google-gax, gcp-metadata, etc). Without blocking it, Metro's file crawler walks into it
// anyway and tries to bundle those packages into the app itself, which fails at runtime in
// ways that look nothing like their real cause (e.g. "Class extends value undefined is not
// a constructor" from a Node-only EventEmitter subclass deep inside google-logging-utils).
//
// This must be anchored to this exact folder, not just any path containing "firebase" --
// an earlier, broader version of this pattern (`/firebase[\\/].*/`) also matched
// `node_modules/firebase/auth`, `node_modules/firebase/functions`, etc. (the real
// `firebase` npm package the app itself imports), silently blocking those too and
// breaking every `firebase/*` import in EAS builds ("Unable to resolve module
// firebase/auth"). Escaping + building the regex from `__dirname` keeps it correct on
// Windows (`\`) and macOS/Linux (`/`) alike.
const ownFunctionsDir = path.join(__dirname, 'firebase', 'functions');
const escapedFunctionsDir = ownFunctionsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${escapedFunctionsDir}[\\\\/].*`)];

module.exports = config;
