import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, ensureSignedIn } from "@/services/firebase";
import { upsertSignedInProfile } from "@/services/userProfile";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Bootstraps the very first session (anonymous sign-in if nothing is stored on-device
    // yet). ensureSignedIn's own onAuthStateChanged listener unsubscribes itself the instant
    // it fires once, so this alone was never enough to reflect anything that happens *after*
    // launch -- see the persistent listener right below for that.
    ensureSignedIn()
      .catch((err) => console.warn("[auth] anonymous sign-in failed", err))
      .finally(() => setLoading(false));

    // The real, persistent subscription -- keeps `user` in sync with Firebase's own auth
    // state for the rest of the app's lifetime, not just a one-time snapshot from launch.
    // Without this (the previous state of this file), a real sign-in completing or a sign-out
    // both genuinely succeeded at the Firebase SDK level but never reflected anywhere in the
    // UI: Settings kept showing "Not signed in" right after a successful Google/Apple sign-in,
    // and kept showing "Signed in as ..." after tapping Sign out, because this context's
    // `user` value was frozen at whatever ensureSignedIn() resolved with at mount and was
    // never updated again for the rest of the session.
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsubscribe;
  }, []);

  // Real "saved immediately" per explicit request -- the instant any Google/Apple/Email sign-in
  // actually lands (this fires the moment the listener above sees the new user), the account's
  // name/email/provider gets written to Firestore, same collection/schema web's own
  // upsertSignedInProfile already uses, so it shows up in the same owner-only admin sign-in
  // panel. A no-op for the app's default anonymous session (upsertSignedInProfile checks
  // isAnonymous itself), so this doesn't fire on every ordinary launch, only a real sign-in.
  useEffect(() => {
    if (user && !user.isAnonymous) {
      upsertSignedInProfile(user).catch((err) => console.warn("[auth] profile sync failed", err));
    }
  }, [user]);

  // Same reasoning as SettingsContext's own fix -- a fresh object literal every render meant
  // every consumer re-rendered on any AuthProvider render, not just the ones that actually
  // change `user`/`loading`.
  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
