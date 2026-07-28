import { initializeApp, getApps, getApp } from "firebase/app";
// NOTE: imported from "@firebase/auth" (not the "firebase/auth" wrapper) because only
// @firebase/auth's package.json declares a legacy "react-native" field pointing at a
// build that includes getReactNativePersistence; the "firebase" wrapper's exports map
// doesn't route that helper to any platform target, RN included, so `firebase/auth`
// silently resolves to a build missing it.
import {
  initializeAuth,
  getReactNativePersistence,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "@firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { env } from "@/config/env";

const firebaseConfig = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  storageBucket: env.firebase.storageBucket,
  messagingSenderId: env.firebase.messagingSenderId,
  appId: env.firebase.appId,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// DIAGNOSTIC BUILD -- AsyncStorage-backed persistence temporarily removed. Sentry's native
// layer and the entire ad SDK (App Open + Banner, including mobileAds().initialize() and the
// ATT prompt) are now BOTH conclusively ruled out (build 25: everything from both subsystems
// off, identical crash persisted). Next candidate with real structural evidence, read directly
// from the installed package: node_modules/@react-native-async-storage/async-storage's
// NativeAsyncStorageModuleSpecJSI (ios/RNCAsyncStorage.mm line ~901, under
// RCT_NEW_ARCH_ENABLED) bridges through ObjCTurboModule exactly like the ad SDK did, and every
// exported method (multiGet/multiSet/multiMerge/getAllKeys/clear -- see
// src/NativeAsyncStorageModule.ts's Spec) is typed `=> void` with a plain callback param, the
// identical performVoidMethodInvocation pattern as appOpenLoad/BannerAd's Commands.load. Unlike
// ads/Sentry, AsyncStorage was NEVER disabled in any build tested so far (20-25) -- it fires
// unconditionally on every single cold launch via this persistence call (before first render)
// and via SettingsContext's loadSettings()/getVoiceEnabled() (see App.tsx/SettingsContext.tsx
// for that half of this same test). Falling back to in-memory-only auth persistence here
// isolates whether Firebase's AsyncStorage reads specifically are involved.
const DIAGNOSTIC_DISABLE_ASYNC_STORAGE_PERSISTENCE = true;

export const auth = DIAGNOSTIC_DISABLE_ASYNC_STORAGE_PERSISTENCE
  ? initializeAuth(firebaseApp)
  : initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });

export const db = getFirestore(firebaseApp);

/**
 * Alerts are attributed to a uid but the app has no account/login screen in v1,
 * so every device signs in anonymously. This still gives each installer a stable
 * uid for the createdBy / hiddenBy ownership rules.
 */
export function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) {
          resolve(user);
          return;
        }
        signInAnonymously(auth)
          .then((cred) => resolve(cred.user))
          .catch(reject);
      },
      reject
    );
  });
}
