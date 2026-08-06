import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
// See firebase.ts's own comment on its "@firebase/functions" import for why this isn't the
// plain "firebase/functions" wrapper -- same repo-relative path collision either way.
import { httpsCallable } from "@firebase/functions";
import { db, functions } from "@/services/firebase";

// Real vehicle-history check via BusinessAPI.com.au's PPSR Searches API. The actual HTTP
// create-then-poll flow now runs server-side (firebase/functions/index.js's runRevCheck) --
// the owner's real, paid provider API key lives only in Firestore's config/revCheckProvider
// doc, readable there only by the Admin SDK and by the owner's own signed-in client (see
// firestore.rules), never by this client for a real paying user. This file is now just the
// thin, honest client-side wrapper: ask the function to run the check, and separately watch
// the public config/revCheckStatus.enabled flag (see subscribeRevCheckProviderStatus) so the
// UI can keep showing an honest "not connected" without ever needing the real key itself.

export interface RevCheckVehicle {
  vin: string;
  make: string | null;
  model: string | null;
  year: string | null;
  colour: string | null;
  bodyType: string | null;
  registrationPlate: string | null;
  registrationExpiry: string | null;
  stolen: boolean;
  writtenOff: boolean;
  safetyRecalls: unknown;
}

export interface RevCheckResult {
  outcome: "not_connected" | "error" | "success";
  message: string;
  vehicle?: RevCheckVehicle;
  securedInterestCount?: number;
  certificateUrl?: string | null;
}

// Live, so a driver already on this screen sees the moment the owner connects (or disconnects)
// a real provider without needing to reopen the app -- onChange fires false on any read error
// too, the same honest "assume not connected" default the old local-settings check always had.
export function subscribeRevCheckProviderStatus(onChange: (enabled: boolean) => void): Unsubscribe {
  return onSnapshot(
    doc(db, "config", "revCheckStatus"),
    (snap) => onChange(snap.exists() && snap.data()?.enabled === true),
    () => onChange(false)
  );
}

const runRevCheckCallable = httpsCallable<{ vin: string }, RevCheckResult>(functions, "runRevCheck");

export async function runRevCheck(vin: string): Promise<RevCheckResult> {
  const trimmedVin = vin.trim().toUpperCase();
  if (!trimmedVin) {
    return { outcome: "error", message: "Enter a VIN to run a real check -- PPSR searches by VIN, not plate." };
  }
  try {
    const result = await runRevCheckCallable({ vin: trimmedVin });
    return result.data;
  } catch (err) {
    return {
      outcome: "error",
      message: `Couldn't reach the REV check service: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
