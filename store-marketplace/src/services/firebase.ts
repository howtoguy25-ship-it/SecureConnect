import { initializeApp, getApps, getApp } from "firebase/app";
// Imported from "@firebase/auth" (not the "firebase/auth" wrapper) -- its package.json's
// "exports" map is the only one with a "react-native" condition whose *runtime* build
// (dist/rn/index.js) includes getReactNativePersistence; Metro/RN's own resolver honors that
// condition correctly. TypeScript's exports-map resolution, however, matches the sibling
// "types" condition (listed before "react-native" in that same conditions object) regardless
// of our configured customConditions, so `tsc` resolves the Node-only .d.ts here and reports
// this as missing even though it's present and used correctly at runtime -- a known upstream
// firebase-js-sdk exports-ordering quirk, not a real missing export.
// @ts-expect-error -- see comment above; getReactNativePersistence exists at runtime (dist/rn).
import { initializeAuth, getReactNativePersistence } from "@firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
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

export const auth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp);
