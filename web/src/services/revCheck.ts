import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/services/firebase";

// Real vehicle-history check via BusinessAPI.com.au's PPSR Searches API, run server-side
// (firebase/functions/index.js's runRevCheck) exactly like mobile's own revCheck.ts -- the
// owner's real, paid provider API key never reaches this client. The website has no App Store/
// Play Store to gate the $14.99 price behind, so a real Stripe Checkout session (see
// createRevCheckCheckout below) is the web equivalent of mobile's IAP purchase.

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

// Live, so a driver already on this page sees the moment the owner connects (or disconnects)
// a real PPSR provider without needing to reload -- fires false on any read error too, the
// same honest "assume not connected" default mobile's own version uses.
export function subscribeRevCheckProviderStatus(onChange: (enabled: boolean) => void): Unsubscribe {
  return onSnapshot(
    doc(db, "config", "revCheckStatus"),
    (snap) => onChange(snap.exists() && snap.data()?.enabled === true),
    () => onChange(false)
  );
}

interface CreateCheckoutResult {
  outcome: "not_connected" | "error" | "success";
  message?: string;
  url?: string;
}

const createRevCheckCheckoutCallable = httpsCallable<{ origin: string }, CreateCheckoutResult>(
  functions,
  "createRevCheckCheckout"
);

// Redirects the whole tab to a real Stripe-hosted Checkout page for one REV check ($14.99 AUD).
// Stripe redirects back to this same origin with ?revcheck_session=<id> once paid (see
// RevCheckPanel.tsx's return-trip handling) -- no Stripe.js/publishable key needed on this
// client at all for this simplest hosted-Checkout flow.
export async function startRevCheckCheckout(): Promise<{ ok: boolean; message?: string }> {
  try {
    const result = await createRevCheckCheckoutCallable({ origin: window.location.origin });
    if (result.data.outcome === "success" && result.data.url) {
      window.location.href = result.data.url;
      return { ok: true };
    }
    return { ok: false, message: result.data.message ?? "Couldn't start payment." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't start payment." };
  }
}

const runRevCheckCallable = httpsCallable<{ vin: string; sessionId?: string }, RevCheckResult>(
  functions,
  "runRevCheck"
);

export async function runRevCheck(vin: string, sessionId: string): Promise<RevCheckResult> {
  const trimmedVin = vin.trim().toUpperCase();
  if (!trimmedVin) {
    return { outcome: "error", message: "Enter a VIN to run a real check -- PPSR searches by VIN, not plate." };
  }
  try {
    const result = await runRevCheckCallable({ vin: trimmedVin, sessionId });
    return result.data;
  } catch (err) {
    return {
      outcome: "error",
      message: `Couldn't reach the REV check service: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
