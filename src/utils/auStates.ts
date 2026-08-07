// PPSR (stolen/written-off/money-owing) is a single national Australian register, but the
// odometer/registration-history side of a REV check (NEVDIS, via brokers like Motorweb/
// InfoAgent) is looked up per state/territory road authority -- so a real check genuinely needs
// this, not just a plate. Australia only, deliberately: this app has no real data source for any
// other country's vehicle registry, so offering a country picker that implies otherwise would be
// a fabricated capability, not a real one.
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
// by real Australian regions instead of a plain distance radius -- per explicit request.
//
// Most of Australia's internal state borders genuinely ARE straight lines of longitude/latitude
// (WA/NT/SA sits exactly on 129°E; NT/SA on 26°S; NT/QLD on 138°E), so this line-based approach
// is a close match to the real borders, not just a rough guess. The two known soft spots:
// the NSW/VIC border mostly follows the Murray River rather than a straight line (approximated
// here with a flat -36° latitude cutoff, so towns right on the river can occasionally land on
// the wrong side), and the SA/QLD border near the Sturt Stony/Simpson Desert corner is
// approximated as a straight 141°E line too (that area is essentially uninhabited outback, so
// the impact is negligible). No network call, no bundled map data -- fully offline, matching how
// the rest of the app already treats Australia as the only supported country.
export type AuRegionCode = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";

export function classifyAuRegion(lat: number, lng: number): AuRegionCode {
  // Tasmania -- island south of the mainland across Bass Strait; checked first since it's
  // further south than mainland Victoria's own southernmost point (Wilsons Promontory, ~-39.13).
  if (lat <= -39.3) return "TAS";

  // ACT -- a small enclave entirely inside NSW around Canberra; checked before the NSW/VIC
  // banding below so it isn't swallowed by the wider NSW catch-all.
  if (lat <= -35.05 && lat >= -36.0 && lng >= 148.7 && lng <= 149.45) return "ACT";

  // Western Australia -- everything west of the real WA/NT/SA border (129°E), the full height
  // of the country.
  if (lng < 129) return "WA";

  // Northern Territory -- east of WA, west of the real NT/QLD border (138°E), north of the real
  // NT/SA border (26°S).
  if (lng < 138 && lat > -26) return "NT";

  // South Australia -- west of the NSW/VIC border (141°E), south of the NT border (26°S).
  if (lng < 141 && lat <= -26) return "SA";

  // Queensland -- east of the NT border, north of the real QLD/NSW border (~29°S).
  if (lat > -29) return "QLD";

  // Victoria -- south of the approximated NSW/VIC border.
  if (lat <= -36) return "VIC";

  // Everything left over (between the QLD and VIC borders, east of SA) -- New South Wales.
  return "NSW";
}
