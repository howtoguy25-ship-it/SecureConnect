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

export const auth = initializeAuth(firebaseApp, {
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
