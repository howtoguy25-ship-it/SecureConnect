import type { AppSettings } from "@/services/settings";

// Real vehicle-history check via BusinessAPI.com.au's PPSR Searches API -- confirmed against
// their actual published docs (businessapi.com.au/developers/api/ppsr-searches and
// .../developers/authentication), not guessed. Two things worth knowing about how this really
// works, both verified from those docs rather than assumed:
//  1. The search key is a VIN (or a PPSR registration number, a separate finance-record ID),
//     NEVER a number plate -- a plate isn't a stable enough identifier for PPSR's own purpose
//     (it changes on re-registration/interstate moves; the VIN never does). NEVDIS vehicle data
//     (make/model/year/stolen/written-off/safety recalls) only comes back on a VIN search.
//  2. A search is async: POST creates it (returns a requestId, status "new"), then a GET on
//     that same path + /{requestId} is polled until status is "completed" or "failed".
const PPSR_BASE_URL = "https://businessapi.com.au/api/v2/ppsr/searches";
const POLL_INTERVAL_MS = 2000;
// BAPI's own docs: "Most searches complete within a few seconds" -- this is a generous ceiling
// (~30s), not an expected wait, so a real completion is never cut off early.
const MAX_POLL_ATTEMPTS = 15;

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

export function isRevCheckProviderConfigured(settings: AppSettings): boolean {
  return !!settings.revCheckPpsrApiKey.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runRevCheck(vin: string, settings: AppSettings): Promise<RevCheckResult> {
  const apiKey = settings.revCheckPpsrApiKey.trim();
  if (!apiKey) {
    return {
      outcome: "not_connected",
      message:
        "No REV check provider connected yet. Add your PPSR provider API key in Settings → " +
        "Vehicle REV Checks to enable real checks.",
    };
  }

  const trimmedVin = vin.trim().toUpperCase();
  if (!trimmedVin) {
    return { outcome: "error", message: "Enter a VIN to run a real check -- PPSR searches by VIN, not plate." };
  }

  // Bearer auth, both key types -- confirmed from businessapi.com.au/developers/authentication.
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const createResp = await fetch(PPSR_BASE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ vin: trimmedVin }),
    });
    if (!createResp.ok) {
      const body = await createResp.text().catch(() => "");
      return {
        outcome: "error",
        message: `PPSR provider rejected the request (HTTP ${createResp.status}).${body ? ` ${body.slice(0, 200)}` : ""}`,
      };
    }
    const created = await createResp.json();
    const requestId = created?.requestId;
    if (requestId === undefined || requestId === null) {
      return { outcome: "error", message: "PPSR provider didn't return a search ID -- try again." };
    }

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const statusResp = await fetch(`${PPSR_BASE_URL}/${requestId}`, { headers });
      // A single bad poll (a transient network hiccup) shouldn't abort the whole check --
      // just skip this tick and try again on the next one, up to MAX_POLL_ATTEMPTS.
      if (!statusResp.ok) continue;
      const statusBody = await statusResp.json();

      if (statusBody?.status === "completed") {
        const data = statusBody.data ?? {};
        const vehicleData = data.nevdisData?.vehicles?.[0];
        return {
          outcome: "success",
          message: "Check complete.",
          vehicle: vehicleData
            ? {
                vin: vehicleData.vin ?? trimmedVin,
                make: vehicleData.make ?? null,
                model: vehicleData.model ?? null,
                year: vehicleData.year ?? null,
                colour: vehicleData.colour ?? null,
                bodyType: vehicleData.bodyType ?? null,
                registrationPlate: vehicleData.registrationPlate ?? null,
                registrationExpiry: vehicleData.registrationExpiry ?? null,
                stolen: !!vehicleData.stolen,
                writtenOff: !!vehicleData.writtenOff,
                safetyRecalls: vehicleData.safetyRecalls ?? null,
              }
            : undefined,
          securedInterestCount: Array.isArray(data.registrations) ? data.registrations.length : 0,
          certificateUrl: data.certificates?.[0]?.downloadUrl ?? null,
        };
      }
      if (statusBody?.status === "failed") {
        return { outcome: "error", message: "The PPSR provider couldn't complete this search -- try again." };
      }
      // "new" or "processing" -- keep polling.
    }
    return {
      outcome: "error",
      message: "This check is taking longer than expected -- try again in a moment.",
    };
  } catch (err) {
    return {
      outcome: "error",
      message: `Couldn't reach the PPSR provider: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
