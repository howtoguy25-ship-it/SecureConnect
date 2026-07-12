import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/services/firebase";

// Records who's actually signed in for the admin panel -- name, email, and which provider,
// never a password (Firebase never gives that to the client or server either way, so
// there's nothing to store even if we wanted to). Anonymous "Continue as Guest" sessions
// have no real identity to record, so this is a no-op for them.
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
      provider,
      lastSignInAt: serverTimestamp(),
      ...(snap.exists() ? {} : { firstSignInAt: serverTimestamp() }),
    },
    { merge: true }
  );
}
