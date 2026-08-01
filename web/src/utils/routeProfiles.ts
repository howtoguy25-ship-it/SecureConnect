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

// Real Google Directions travel modes -- driving keeps the 3-way Best/Fast/Comfort picker
// above; walking/bicycling/transit each get one genuine, independently-fetched Directions
// result instead (Google has exactly one meaningful route per mode in the overwhelming
// majority of cases -- transit trips especially are governed by real timetables, not
// alternative road choices), mirroring the mobile app's directions.ts TravelMode.
export type TravelMode = "driving" | "walking" | "bicycling" | "transit";

export const TRAVEL_MODE_ORDER: TravelMode[] = ["driving", "walking", "bicycling", "transit"];

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  driving: "Drive",
  walking: "Walk",
  bicycling: "Bike",
  transit: "Transit",
};

export const TRAVEL_MODE_ICONS: Record<TravelMode, string> = {
  driving: "🚗",
  walking: "🚶",
  bicycling: "🚲",
  transit: "🚌",
};

export function toGoogleTravelMode(mode: TravelMode): google.maps.TravelMode {
  switch (mode) {
    case "walking":
      return google.maps.TravelMode.WALKING;
    case "bicycling":
      return google.maps.TravelMode.BICYCLING;
    case "transit":
      return google.maps.TravelMode.TRANSIT;
    default:
      return google.maps.TravelMode.DRIVING;
  }
}
