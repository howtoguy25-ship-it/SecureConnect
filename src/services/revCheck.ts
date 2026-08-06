import type { AppSettings } from "@/services/settings";

// Real Australian vehicle-history data lives in two separate places, neither reachable for
// free or without a signed-up broker account (researched directly, not assumed): PPSR
// (stolen/written-off/money-owing -- ppsr.gov.au, ~$2/search direct or an accredited broker like
// BusinessAPI.com.au), and NEVDIS (registration + odometer history -- not part of PPSR at all,
// only reachable via a commercial broker like Motorweb/InfoAgent). This app has no such account
// of its own and never fabricates vehicle history -- so this only ever returns a real result once
// the driver has signed up themselves and pasted a real key into Settings, and even then, honestly
// reports that this specific broker's request/response contract still needs to be wired in
// (every broker's API shape is different -- there's no generic "REV check" HTTP call to make
// without that broker's real docs in hand).
export interface RevCheckResult {
  connected: boolean;
  message: string;
}

export function isRevCheckProviderConfigured(settings: AppSettings): boolean {
  return !!(settings.revCheckPpsrApiKey.trim() || settings.revCheckNevdisApiKey.trim());
}

export async function runRevCheck(
  plate: string,
  state: string,
  settings: AppSettings
): Promise<RevCheckResult> {
  const hasPpsr = !!settings.revCheckPpsrApiKey.trim();
  const hasNevdis = !!settings.revCheckNevdisApiKey.trim();

  if (!hasPpsr && !hasNevdis) {
    return {
      connected: false,
      message:
        "No REV check provider connected yet. Sign up for a PPSR broker (stolen/written-off/" +
        "money-owing) and a NEVDIS broker (registration + odometer history), then add your API " +
        "key in Settings → Vehicle REV Checks to enable real checks for this plate.",
    };
  }

  // A key is saved, but there's still no real request going out: each broker's endpoint URL,
  // auth header shape, and response JSON are different, and none of that is known here yet.
  // Honest about exactly what's missing, not a fabricated result dressed up as real data.
  return {
    connected: false,
    message:
      "Provider key saved, but the real request for your specific broker hasn't been wired in " +
      "yet -- send the broker's API documentation and this will start returning real 5-year " +
      "rego and odometer history for " + plate + " (" + state + ").",
  };
}
