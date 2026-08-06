import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/services/firebase";

export async function syncAlertRadiusToProfile(uid: string, alertRadiusKm: number): Promise<void> {
  await setDoc(
    doc(db, "users", uid),
    { alertRadiusKm, updatedAt: Date.now() },
    { merge: true }
  );
}

// Mirrors web/src/services/userProfile.ts's upsertSignedInProfile exactly -- same collection,
// same field names -- so a real (non-anonymous) sign-in on mobile shows up in the existing
// admin sign-in-history panel (web/src/components/AdminPanel.tsx) the same way a web sign-in
// already does. Records who's actually signed in for the owner-only admin panel -- name,
// email, and which provider, never a password (Firebase never gives that to client or server
// code either way, so there's nothing to store even if we wanted to). No-op for the app's own
// anonymous session (every device has one from launch, see firebase.ts's ensureSignedIn) --
// there's no real identity there worth recording.
export async function upsertSignedInProfile(user: User): Promise<void> {
  if (user.isAnonymous) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const provider = user.providerData[0]?.providerId ?? "unknown";

  await setDoc(
    ref,
    {
      displayName: user.displayName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      provider,
      platform: "mobile",
      lastSignInAt: serverTimestamp(),
      ...(snap.exists() ? {} : { firstSignInAt: serverTimestamp() }),
    },
    { merge: true }
  );
}
