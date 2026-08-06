import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/services/firebase";

// Owner-only management of the real REV check provider credentials -- firestore.rules restricts
// both documents this touches to the admin email, so calling these as anyone else fails with a
// real Firestore permission-denied error rather than silently doing nothing. Kept as its own
// file, separate from revCheck.ts (which every signed-in user's client uses to actually run a
// check), so it's obvious at a glance which parts of this feature are owner-only surface area.

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

// Writes the real keys AND the public "is a provider actually connected" status flag every
// paying user's client reads (config/revCheckStatus, see revCheck.ts) in the same call, so the
// two documents can never drift out of sync with each other -- this is the one and only place
// either ever gets written. NEVDIS isn't wired to any real call yet (see revCheck.ts/the Cloud
// Function's own history -- only PPSR/BAPI is live), so "connected" is judged on the PPSR key
// alone, same as the app's behavior before this moved server-side; the NEVDIS field is still
// saved for whenever that provider is actually wired up.
export async function saveRevCheckProviderConfig(config: RevCheckProviderConfig): Promise<void> {
  const ppsrApiKey = config.ppsrApiKey.trim();
  const nevdisApiKey = config.nevdisApiKey.trim();
  await Promise.all([
    setDoc(doc(db, "config", "revCheckProvider"), { ppsrApiKey, nevdisApiKey, updatedAt: serverTimestamp() }),
    setDoc(doc(db, "config", "revCheckStatus"), { enabled: !!ppsrApiKey, updatedAt: serverTimestamp() }),
  ]);
}
