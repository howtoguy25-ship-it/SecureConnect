import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";

// Owner-only management of the real REV check provider credentials -- firestore.rules restricts
// both documents this touches to the admin email, so calling these as anyone else fails with a
// real Firestore permission-denied error rather than silently doing nothing. Mirrors mobile's
// src/services/revCheckAdmin.ts exactly -- this is the web equivalent so the owner can manage
// the key from either platform; only the mobile app actually runs paid checks against it (no
// web payment flow exists), but the key itself only ever needs setting in one place.

export interface RevCheckProviderConfig {
  ppsrApiKey: string;
  nevdisApiKey: string;
}

export async function getRevCheckProviderConfig(): Promise<RevCheckProviderConfig> {
  const snap = await getDoc(doc(db, "config", "revCheckProvider"));
  const data = snap.data();
  return {
    ppsrApiKey: typeof data?.ppsrApiKey === "string" ? data.ppsrApiKey : "",
    nevdisApiKey: typeof data?.nevdisApiKey === "string" ? data.nevdisApiKey : "",
  };
}

export async function saveRevCheckProviderConfig(config: RevCheckProviderConfig): Promise<void> {
  const ppsrApiKey = config.ppsrApiKey.trim();
  const nevdisApiKey = config.nevdisApiKey.trim();
  await Promise.all([
    setDoc(doc(db, "config", "revCheckProvider"), { ppsrApiKey, nevdisApiKey, updatedAt: serverTimestamp() }),
    setDoc(doc(db, "config", "revCheckStatus"), { enabled: !!ppsrApiKey, updatedAt: serverTimestamp() }),
  ]);
}
