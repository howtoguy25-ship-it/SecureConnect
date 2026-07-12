import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/services/firebase";

const PSEUDO_EMAIL_SUFFIX = "@trackline.phoneauth.internal";

// Records who's actually signed in for the admin panel -- name, email/phone, and which
// provider, never a password (Firebase never gives that to the client or server either
// way, so there's nothing to store even if we wanted to). Anonymous "Continue as Guest"
// sessions have no real identity to record, so this is a no-op for them.
export async function upsertSignedInProfile(user: User): Promise<void> {
  if (user.isAnonymous) return;

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  // Phone accounts link a synthetic, never-shown email (see firebase.ts) so a password
  // provider can attach to them -- don't surface that internal address anywhere real.
  const isPseudoEmail = user.email?.endsWith(PSEUDO_EMAIL_SUFFIX) ?? false;
  const provider = user.providerData.some((p) => p.providerId === "phone")
    ? "phone"
    : (user.providerData[0]?.providerId ?? "unknown");

  await setDoc(
    ref,
    {
      displayName: user.displayName,
      email: isPseudoEmail ? null : user.email,
      phoneNumber: user.phoneNumber,
      provider,
      lastSignInAt: serverTimestamp(),
      ...(snap.exists() ? {} : { firstSignInAt: serverTimestamp() }),
    },
    { merge: true }
  );
}
