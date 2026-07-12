import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithCredential,
  linkWithPopup,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
  type AuthProvider,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

// Same anonymous-sign-in model as the mobile app so alerts share one createdBy/hiddenBy
// uid space across both clients. This still runs first on every load -- signing in with
// Google/Apple (below) upgrades this same session instead of replacing it, so a fresh
// visitor never has to sign in just to use the map.
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

// Links the given OAuth provider to the current (usually anonymous) session so existing
// alerts/ownership carry over under the same uid, instead of starting a brand-new account.
// Falls back to signing straight into the existing real account if that Google/Apple
// identity already belongs to one (e.g. they signed in before on another device) --
// Firebase surfaces that case as `auth/credential-already-in-use` with a reusable
// credential attached to the error.
async function linkOrSignIn(provider: AuthProvider): Promise<User> {
  const current = auth.currentUser;
  try {
    if (current?.isAnonymous) {
      const cred = await linkWithPopup(current, provider);
      return cred.user;
    }
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    const code = err instanceof Object && "code" in err ? String((err as any).code) : null;
    if (code === "auth/credential-already-in-use") {
      const existingCred =
        GoogleAuthProvider.credentialFromError(err as any) ??
        OAuthProvider.credentialFromError(err as any);
      if (existingCred) {
        const cred = await signInWithCredential(auth, existingCred);
        return cred.user;
      }
    }
    throw err;
  }
}

export function signInWithGoogle(): Promise<User> {
  return linkOrSignIn(new GoogleAuthProvider());
}

// Requires "Sign in with Apple" to be configured in the Firebase console, which needs a
// paid Apple Developer Program account (Services ID + key) -- see web/README.md.
export function signInWithApple(): Promise<User> {
  return linkOrSignIn(new OAuthProvider("apple.com"));
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}
