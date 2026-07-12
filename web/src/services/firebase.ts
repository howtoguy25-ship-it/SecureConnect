import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signInWithCredential,
  linkWithPopup,
  signInWithPhoneNumber,
  linkWithPhoneNumber,
  signInWithEmailAndPassword,
  linkWithCredential,
  updatePassword,
  EmailAuthProvider,
  RecaptchaVerifier,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
  type AuthProvider,
  type ConfirmationResult,
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
// identity already belongs to one (e.g. they signed in before on another device, or the
// same email is already used by a different provider) -- Firebase surfaces both cases
// (`auth/credential-already-in-use` and `auth/email-already-in-use`) with a reusable
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
    if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
      const existingCred =
        GoogleAuthProvider.credentialFromError(err as any) ??
        OAuthProvider.credentialFromError(err as any);
      if (existingCred) {
        const cred = await signInWithCredential(auth, existingCred);
        return cred.user;
      }
      if (code === "auth/email-already-in-use") {
        throw new Error(
          "That email is already used by a different sign-in method on this project. Try signing in with the original method instead."
        );
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

// --- Phone number + password sign-in (real Firebase Phone Auth SMS codes, not simulated) ---
//
// Firebase's password provider needs an email-shaped identifier, and phone numbers don't
// have one -- this derives a stable, never-shown, never-emailed pseudo-address purely so
// that provider can be linked to a phone-verified account. Every real login still requires
// an actual SMS code; the password is a second factor on top of that, not a replacement
// for it, matching a true phone + password + OTP flow.
function pseudoEmailForPhone(phoneE164: string): string {
  return `phone-${phoneE164.replace(/[^0-9]/g, "")}@trackline.phoneauth.internal`;
}

// A fresh RecaptchaVerifier is created per attempt rather than cached at module level --
// caching it meant a second attempt (e.g. after closing and reopening the sign-in panel)
// reused a verifier bound to a DOM container that had since been unmounted, throwing
// "reCAPTCHA client element has been removed". Recreating it each time always binds to
// whatever container is actually mounted right now.
function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, containerId, { size: "invisible" });
}

// Sends a real SMS code to the given phone number (E.164 format, e.g. "+61474011265").
// Links to the current anonymous session when possible (same alert-ownership-preserving
// pattern as Google/Apple), falling back to a plain sign-in when that number already
// belongs to a different existing account (a returning user on a fresh session).
export async function sendPhoneVerificationCode(
  phoneE164: string,
  recaptchaContainerId: string
): Promise<ConfirmationResult> {
  const verifier = createRecaptchaVerifier(recaptchaContainerId);
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    try {
      return await linkWithPhoneNumber(current, phoneE164, verifier);
    } catch (err) {
      const code = err instanceof Object && "code" in err ? String((err as any).code) : null;
      if (code !== "auth/credential-already-in-use" && code !== "auth/provider-already-linked") {
        throw err;
      }
      // Falls through: this number already belongs to a different account, so start a
      // fresh sign-in to that existing account instead of linking.
    }
  }
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

export async function confirmPhoneVerificationCode(
  confirmation: ConfirmationResult,
  code: string
): Promise<User> {
  const cred = await confirmation.confirm(code);
  return cred.user;
}

// True once this phone-verified account already has a password set up.
export function phoneAccountHasPassword(user: User): boolean {
  return user.providerData.some((p) => p.providerId === "password");
}

// First-time setup: links a password to the just-phone-verified account.
export async function setPhonePassword(phoneE164: string, password: string): Promise<void> {
  const current = auth.currentUser;
  if (!current) throw new Error("Not signed in.");
  const cred = EmailAuthProvider.credential(pseudoEmailForPhone(phoneE164), password);
  await linkWithCredential(current, cred);
}

// Returning-user login: verifies the password against the account the phone number was
// just re-verified into. Throws with Firebase's real auth/wrong-password code on mismatch.
export async function verifyPhonePassword(phoneE164: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, pseudoEmailForPhone(phoneE164), password);
  return cred.user;
}

// Forgot-password recovery: only callable right after a fresh SMS re-verification (that
// recency is what Firebase requires to allow changing the password at all), so possession
// of the phone is the actual recovery proof -- a real working reset, not a dead-end email.
export async function resetPhonePassword(newPassword: string): Promise<void> {
  const current = auth.currentUser;
  if (!current) throw new Error("Not signed in.");
  await updatePassword(current, newPassword);
}
