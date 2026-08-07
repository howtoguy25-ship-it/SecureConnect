// Mirrors mobile's src/utils/auStates.ts exactly -- PPSR (stolen/written-off/money-owing) is a
// single national Australian register, but the odometer/registration-history side of a REV
// check (NEVDIS) is looked up per state/territory road authority, so a real check genuinely
// needs this, not just a plate. Australia only, deliberately -- this app has no real data
// source for any other country's vehicle registry.
export interface AuState {
  code: string;
  label: string;
}

export const AU_STATES: AuState[] = [
  { code: "NSW", label: "New South Wales" },
  { code: "VIC", label: "Victoria" },
  { code: "QLD", label: "Queensland" },
  { code: "WA", label: "Western Australia" },
  { code: "SA", label: "South Australia" },
  { code: "TAS", label: "Tasmania" },
  { code: "ACT", label: "Australian Capital Territory" },
  { code: "NT", label: "Northern Territory" },
];

export const DEFAULT_AU_STATE = "NSW";

// Real state/territory classification for a lat/lng, used to tag every alert with the region
// it was placed in (see services/alerts.ts's reportAlert) so alert visibility can be filtered
// by real Australian regions instead of a plain distance radius -- per explicit request. Exact
// mirror of mobile's src/utils/auStates.ts -- see that file's header for the border-approximation
// notes (most of Australia's internal borders genuinely are straight lines; the NSW/VIC Murray
// River border and the remote SA/QLD desert corner are the two approximated soft spots).
export type AuRegionCode = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";

export function classifyAuRegion(lat: number, lng: number): AuRegionCode {
  if (lat <= -39.3) return "TAS";
  if (lat <= -35.05 && lat >= -36.0 && lng >= 148.7 && lng <= 149.45) return "ACT";
  if (lng < 129) return "WA";
  if (lng < 138 && lat > -26) return "NT";
  if (lng < 141 && lat <= -26) return "SA";
  if (lat > -29) return "QLD";
  if (lat <= -36) return "VIC";
  return "NSW";
}
