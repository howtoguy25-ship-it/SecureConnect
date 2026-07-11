export type RouteKey = "best" | "fast" | "comfort";

// Each profile maps to a real, distinctly-constrained Google Directions request (not a
// fabricated "traffic mood" score) — "comfort" genuinely avoids highways and tolls,
// "fast" genuinely avoids highways only, "best" is Google's unconstrained fastest route.
export const ROUTE_PROFILES: Record<
  RouteKey,
  { label: string; subtitle: string; avoidHighways?: boolean; avoidTolls?: boolean }
> = {
  best: {
    label: "Best",
    subtitle: "Quickest overall — highways & tolls if faster",
  },
  fast: {
    label: "Fast",
    subtitle: "Backstreet shortcuts, no highways",
    avoidHighways: true,
  },
  comfort: {
    label: "Comfort",
    subtitle: "Relaxed route — avoids highways & tolls",
    avoidHighways: true,
    avoidTolls: true,
  },
};

export const ROUTE_ORDER: RouteKey[] = ["best", "fast", "comfort"];
