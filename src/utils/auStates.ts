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
