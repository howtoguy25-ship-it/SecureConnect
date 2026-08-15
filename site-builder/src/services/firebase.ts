import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, Auth, Persistence } from 'firebase/auth';
import { initializeFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@/config/env';

// firebase's package.json "exports" map declares a flat top-level "types" field for the
// "firebase/auth" subpath, which TypeScript always prefers over the platform-specific
// "react-native" export condition -- so `getReactNativePersistence` (only declared in the
// RN-specific dist/rn/index.rn.d.ts) is invisible to tsc even though Metro correctly
// resolves the real React Native build at runtime (@firebase/auth's package.json does
// expose a "react-native" condition, and Metro's resolver picks it up -- confirmed by
// inspecting node_modules directly). This is a gap in Firebase's published types, not a
// bug here, so it's isolated to this one cast rather than a blanket ts-ignore.
import * as FirebaseAuthModule from 'firebase/auth';
const getReactNativePersistence = (
  FirebaseAuthModule as unknown as { getReactNativePersistence: (storage: unknown) => Persistence }
).getReactNativePersistence;

const firebaseConfig = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  storageBucket: env.firebase.storageBucket,
  messagingSenderId: env.firebase.messagingSenderId,
  appId: env.firebase.appId,
};

// `initializeAuth` throws synchronously (auth/invalid-api-key) the moment it's called with
// an empty/placeholder config -- which is exactly the state this app ships in until a real
// Firebase project's config is dropped into .env (see ROADMAP.md "Setup"). Without this
// guard that throw happens at module load, before React even mounts, crashing to a blank
// white screen with no explanation. Skipping init entirely when unconfigured lets the app
// show a real "connect Firebase" screen instead (see RootNavigator).
let _firebaseApp: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _functions: Functions | null = null;

if (env.isFirebaseConfigured) {
  _firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

  // `initializeAuth` (rather than `getAuth`) is required on React Native so auth state is
  // persisted to AsyncStorage across app restarts — `getAuth()` defaults to in-memory
  // persistence on RN and silently signs the user out every cold start.
  try {
    _auth = initializeAuth(_firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // initializeAuth throws if already called (e.g. Fast Refresh re-running this module) --
    // fall back to the already-initialized instance.
    _auth = getAuth(_firebaseApp);
  }

  // long polling avoids Firestore's default WebChannel transport, which can be blocked by
  // some proxies/VPNs in ways that hang silently instead of failing fast.
  _db = initializeFirestore(_firebaseApp, {
    experimentalAutoDetectLongPolling: true,
  });

  _functions = getFunctions(_firebaseApp);
}

export const firebaseApp = _firebaseApp;
export const auth = _auth;
export const db = _db;
export const functions = _functions;
