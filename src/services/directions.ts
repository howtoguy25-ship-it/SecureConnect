import { env } from "@/config/env";
import { decodePolyline, type LatLng } from "@/utils/polyline";

export type ManeuverType =
  | "turn-left"
  | "turn-right"
  | "turn-slight-left"
  | "turn-slight-right"
  | "turn-sharp-left"
  | "turn-sharp-right"
  | "uturn-left"
  | "uturn-right"
  | "merge"
  | "roundabout-left"
  | "roundabout-right"
  | "fork-left"
  | "fork-right"
  | "ramp-left"
  | "ramp-right"
  | "straight"
  | undefined;

export interface RouteStep {
  instruction: string; // plain-text, HTML stripped
  maneuver: ManeuverType;
  distanceMeters: number;
  durationSeconds: number;
  startLocation: LatLng;
  endLocation: LatLng;
  polyline: LatLng[];
}

export interface Route {
  polyline: LatLng[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
  etaText: string;
  distanceText: string;
  // Only set when the request asked for live traffic (see DirectionsOptions.useTraffic) and
  // Google actually returned a traffic-adjusted figure. durationSeconds/etaText above always
  // stay the free-flow figure so callers that don't care about traffic get a stable value.
  durationInTrafficSeconds?: number;
  etaInTrafficText?: string;
  // True once durationInTraffic meaningfully exceeds free-flow duration -- the "there's
  // traffic on this one" signal for the route picker, not just noise from rounding.
  hasTrafficDelay?: boolean;
}

export interface DirectionsOptions {
  avoidHighways?: boolean;
  avoidTolls?: boolean;
  waypoint?: LatLng;
  // Requests Google's live traffic-adjusted duration (departure_time=now). Left opt-in
  // (rather than always-on) because it's the one param that makes the three parallel
  // route-option requests non-cacheable/time-sensitive -- only the profile that actually
  // needs a "there's traffic" signal should pay for it.
  useTraffic?: boolean;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function getDirections(
  origin: LatLng,
  destination: LatLng,
  options: DirectionsOptions = {}
): Promise<Route> {
  const { avoidHighways, avoidTolls, waypoint, useTraffic } = options;

  const avoid = [avoidHighways && "highways", avoidTolls && "tolls"].filter(Boolean).join("|");

  const url =
    "https://maps.googleapis.com/maps/api/directions/json" +
    `?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}` +
    `&mode=driving&key=${env.googleDirectionsApiKey}` +
    (avoid ? `&avoid=${avoid}` : "") +
    (waypoint ? `&waypoints=${waypoint.latitude},${waypoint.longitude}` : "") +
    (useTraffic ? `&departure_time=now&traffic_model=best_guess` : "");

  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.routes?.length) {
    throw new Error(`Directions request failed: ${json.status ?? "unknown error"}`);
  }

  const route = json.routes[0];
  const leg = route.legs[0];

  const steps: RouteStep[] = leg.steps.map((step: any) => ({
    instruction: stripHtml(step.html_instructions ?? ""),
    maneuver: step.maneuver,
    distanceMeters: step.distance?.value ?? 0,
    durationSeconds: step.duration?.value ?? 0,
    startLocation: { latitude: step.start_location.lat, longitude: step.start_location.lng },
    endLocation: { latitude: step.end_location.lat, longitude: step.end_location.lng },
    polyline: decodePolyline(step.polyline?.points ?? ""),
  }));

  const durationSeconds: number = leg.duration?.value ?? 0;
  const durationInTrafficSeconds: number | undefined = leg.duration_in_traffic?.value;

  return {
    polyline: decodePolyline(route.overview_polyline.points),
    steps,
    distanceMeters: leg.distance?.value ?? 0,
    durationSeconds,
    etaText: leg.duration?.text ?? "",
    distanceText: leg.distance?.text ?? "",
    durationInTrafficSeconds,
    etaInTrafficText: leg.duration_in_traffic?.text,
    // 10% + a 60s floor so a couple of red lights don't get flagged as "traffic".
    hasTrafficDelay:
      durationInTrafficSeconds != null &&
      durationInTrafficSeconds > durationSeconds + Math.max(60, durationSeconds * 0.1),
  };
}

export type RouteProfileKey = "normal" | "fastest" | "safest";

export const ROUTE_PROFILE_LABELS: Record<RouteProfileKey, string> = {
  normal: "Normal",
  fastest: "Fastest",
  safest: "Safest",
};

// Three real, independently-fetched Google Directions results, not one call's
// `alternatives` -- alternatives are Google's own idea of "other reasonable routes" and
// don't let us ask for a specific character (backstreets-only, tolls-free, etc.) the way
// separate `avoid`/traffic-aware requests do. Mirrors the web app's routeProfiles.ts.
const ROUTE_PROFILE_OPTIONS: Record<RouteProfileKey, DirectionsOptions> = {
  // No constraints -- Google's own default best route, unhurried.
  normal: {},
  // Backstreets, live-traffic-aware duration so the picker can show "there's traffic" --
  // this is the one profile actually worth the extra traffic-model request.
  fastest: { avoidHighways: true, useTraffic: true },
  // Keeps highways available (a toll-free backstreets-only route is often *less* safe --
  // narrower roads, more intersections) but skips tolls, and considers every road type
  // Google itself is willing to route through.
  safest: { avoidTolls: true },
};

/** Fetches all 3 route profiles in parallel for the route-choice picker. */
export async function getRouteOptions(
  origin: LatLng,
  destination: LatLng,
  waypoint?: LatLng
): Promise<Record<RouteProfileKey, Route>> {
  const entries = await Promise.all(
    (Object.keys(ROUTE_PROFILE_OPTIONS) as RouteProfileKey[]).map(async (key) => {
      const route = await getDirections(origin, destination, {
        ...ROUTE_PROFILE_OPTIONS[key],
        waypoint,
      });
      return [key, route] as const;
    })
  );
  return Object.fromEntries(entries) as Record<RouteProfileKey, Route>;
}
