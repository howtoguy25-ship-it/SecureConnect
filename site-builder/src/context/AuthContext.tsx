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
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth } from '@/services/firebase';
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
  signOut: () => Promise<void>;
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

  const signOut = async () => {
    const currentUid = requireAuth().currentUser?.uid;
    // Must run before firebaseSignOut -- deleting the token doc needs to still be
    // authenticated as this uid, otherwise Firestore rules would reject the delete.
    if (currentUid) await unregisterCurrentDeviceToken(currentUid).catch(() => {});
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
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
