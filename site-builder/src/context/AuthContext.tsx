import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ApplicationVerifier,
  ConfirmationResult,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  signInWithCredential,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { ensureAccount } from '@/services/aiBuilder';
import { registerForPushNotifications, unregisterCurrentDeviceToken } from '@/services/pushNotifications';

function requireAuth() {
  if (!auth) {
    throw new Error('Firebase is not configured yet — see ROADMAP.md "Setup" to add your project config to .env.');
  }
  return auth;
}

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  startPhoneVerification: (phoneNumber: string, verifier: ApplicationVerifier) => Promise<void>;
  confirmPhoneCode: (code: string) => Promise<void>;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signInWithAppleToken: (idToken: string, rawNonce: string) => Promise<void>;
  signInWithGooglePopup: () => Promise<void>;
  signInWithApplePopup: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    if (!auth) {
      // Unconfigured Firebase — nothing to listen to; RootNavigator shows a setup screen.
      setInitializing(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setInitializing(false);
      if (nextUser) {
        // Fire-and-forget: guarantees the credits doc exists so the balance UI has
        // something to show immediately, even for accounts older than this function.
        ensureAccount().catch(() => {});
        // Also fire-and-forget -- a denied/skipped permission prompt shouldn't block
        // sign-in, and most of the time this is a no-op after the very first launch.
        registerForPushNotifications(nextUser.uid).catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  const signUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(requireAuth(), email, password);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(requireAuth(), email, password);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(requireAuth(), email);
  };

  const startPhoneVerification = async (phoneNumber: string, verifier: ApplicationVerifier) => {
    confirmationRef.current = await signInWithPhoneNumber(requireAuth(), phoneNumber, verifier);
  };

  const confirmPhoneCode = async (code: string) => {
    if (!confirmationRef.current) {
      throw new Error('Start phone verification before confirming a code.');
    }
    await confirmationRef.current.confirm(code);
    confirmationRef.current = null;
  };

  const signInWithGoogleIdToken = async (idToken: string) => {
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(requireAuth(), credential);
  };

  const signInWithAppleToken = async (idToken: string, rawNonce: string) => {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken, rawNonce });
    await signInWithCredential(requireAuth(), credential);
  };

  // Web-only: native platforms use the on-device Google/Apple flows above (an id token
  // handed to signInWithCredential). A real browser has no native Google/Apple SDK, but
  // Firebase Auth's own popup flow works directly against a real DOM window, so web just
  // asks Firebase to open the provider's real OAuth consent screen itself.
  const signInWithGooglePopup = async () => {
    await signInWithPopup(requireAuth(), new GoogleAuthProvider());
  };

  const signInWithApplePopup = async () => {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    await signInWithPopup(requireAuth(), provider);
  };

  const signOut = async () => {
    const currentUid = requireAuth().currentUser?.uid;
    // Must run before firebaseSignOut -- deleting the token doc needs to still be
    // authenticated as this uid, otherwise Firestore rules would reject the delete.
    if (currentUid) await unregisterCurrentDeviceToken(currentUid).catch(() => {});
    await firebaseSignOut(requireAuth());
  };

  // Real deletion (App Store guideline 5.1.1(v)) -- deleteAccount itself unpublishes every
  // site, wipes every Firestore doc under this account, deletes uploaded files, and deletes
  // the real Firebase Auth user server-side. This just clears the local session afterward
  // so the app actually navigates back to the signed-out state instead of holding onto a
  // now-dead user object.
  const deleteAccount = async () => {
    const call = httpsCallable(requireFunctions(functions), 'deleteAccount');
    await call();
    await firebaseSignOut(requireAuth());
  };

  const value: AuthContextValue = {
    user,
    initializing,
    signUpWithEmail,
    signInWithEmail,
    resetPassword,
    startPhoneVerification,
    confirmPhoneCode,
    signInWithGoogleIdToken,
    signInWithAppleToken,
    signInWithGooglePopup,
    signInWithApplePopup,
    signOut,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
