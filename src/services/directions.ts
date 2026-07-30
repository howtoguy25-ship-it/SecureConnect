import { env } from "@/config/env";
import { decodePolyline, type LatLng } from "@/utils/polyline";
import { Sentry } from "@/services/sentry";

export class DirectionsApiError extends Error {
  constructor(public status: string, message?: string) {
    super(message ? `${status}: ${message}` : status);
    this.name = "DirectionsApiError";
  }
}

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

function parseRoute(route: any): Route {
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

function buildDirectionsUrl(
  origin: LatLng,
  destination: LatLng,
  mode: TravelMode,
  options: DirectionsOptions & { alternatives?: boolean }
): string {
  const { avoidHighways, avoidTolls, waypoint, useTraffic, alternatives } = options;
  const avoid = [avoidHighways && "highways", avoidTolls && "tolls"].filter(Boolean).join("|");

  return (
    "https://maps.googleapis.com/maps/api/directions/json" +
    `?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}` +
    `&mode=${mode}&key=${env.googleDirectionsApiKey}` +
    (avoid ? `&avoid=${avoid}` : "") +
    (waypoint ? `&waypoints=${waypoint.latitude},${waypoint.longitude}` : "") +
    (useTraffic ? `&departure_time=now&traffic_model=best_guess` : "") +
    (alternatives ? `&alternatives=true` : "")
  );
}

export async function getDirections(
  origin: LatLng,
  destination: LatLng,
  options: DirectionsOptions = {}
): Promise<Route> {
  const url = buildDirectionsUrl(origin, destination, "driving", options);
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.routes?.length) {
    Sentry.logger.error("directions: request failed", {
      status: json.status,
      errorMessage: json.error_message,
    });
    throw new DirectionsApiError(json.status ?? "UNKNOWN_ERROR", json.error_message);
  }

  return parseRoute(json.routes[0]);
}

// Real "fastest" means genuinely the quickest option Google has available right now, not a
// single route forced through backstreets a priori -- forcing avoidHighways used to make this
// profile literally the slowest of the three (a real, confirmed bug: 3h/158km "Fastest" vs
// 1h47/130km "Normal" on the same trip, since skipping a motorway on a long drive is almost
// never actually faster). This asks Google for every alternative it's willing to offer, with
// live traffic factored in, and picks whichever one actually has the lowest traffic-aware
// duration -- so "Fastest" can end up being the highway route, a backstreet route, or whatever
// else genuinely gets there quickest, decided by the real numbers instead of a fixed constraint.
async function getFastestRoute(origin: LatLng, destination: LatLng, waypoint?: LatLng): Promise<Route> {
  const url = buildDirectionsUrl(origin, destination, "driving", {
    waypoint,
    useTraffic: true,
    alternatives: true,
  });
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.routes?.length) {
    Sentry.logger.error("directions: fastest-route request failed", {
      status: json.status,
      errorMessage: json.error_message,
    });
    throw new DirectionsApiError(json.status ?? "UNKNOWN_ERROR", json.error_message);
  }

  const candidates = json.routes.map(parseRoute);
  return candidates.reduce((best: Route, candidate: Route) =>
    (candidate.durationInTrafficSeconds ?? candidate.durationSeconds) <
    (best.durationInTrafficSeconds ?? best.durationSeconds)
      ? candidate
      : best
  );
}

export type RouteProfileKey = "normal" | "fastest" | "safest";

export const ROUTE_PROFILE_LABELS: Record<RouteProfileKey, string> = {
  normal: "Normal",
  fastest: "Fastest",
  safest: "Safest",
};

// "safest" keeps highways available (a toll-free backstreets-only route is often *less* safe
// -- narrower roads, more intersections) but skips tolls, and considers every road type Google
// itself is willing to route through. "fastest" is handled separately below via
// getFastestRoute -- it's not a fixed-constraint request like this one.
const SAFEST_OPTIONS: DirectionsOptions = { avoidTolls: true };

/** Fetches all 3 route profiles in parallel for the route-choice picker. Each is a real,
 *  independently-fetched Google Directions result (not one call's `alternatives` alone for
 *  normal/safest) so "safest" can ask for a specific character (tolls-free) that a plain
 *  alternatives list wouldn't guarantee. Mirrors the web app's routeProfiles.ts. */
export async function getRouteOptions(
  origin: LatLng,
  destination: LatLng,
  waypoint?: LatLng
): Promise<Record<RouteProfileKey, Route>> {
  const [normal, fastest, safest] = await Promise.all([
    getDirections(origin, destination, { waypoint }),
    getFastestRoute(origin, destination, waypoint),
    getDirections(origin, destination, { ...SAFEST_OPTIONS, waypoint }),
  ]);
  return { normal, fastest, safest };
}

export type TravelMode = "driving" | "walking" | "bicycling" | "transit";

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  driving: "Drive",
  walking: "Walk",
  bicycling: "Bike",
  transit: "Transit",
};

/** A single real route for a non-driving travel mode (walking/bicycling/transit) -- genuine
 *  Google Directions results for that mode, not an estimate derived from the driving route.
 *  Unlike driving, these don't get a 3-way Normal/Fastest/Safest picker: Google has exactly
 *  one meaningful route per mode in the overwhelming majority of cases (transit trips in
 *  particular are governed by real timetables, not alternative road choices). */
export async function getDirectionsForMode(
  origin: LatLng,
  destination: LatLng,
  mode: Exclude<TravelMode, "driving">,
  waypoint?: LatLng
): Promise<Route> {
  const url = buildDirectionsUrl(origin, destination, mode, { waypoint });
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.routes?.length) {
    Sentry.logger.error("directions: mode request failed", {
      mode,
      status: json.status,
      errorMessage: json.error_message,
    });
    throw new DirectionsApiError(json.status ?? "UNKNOWN_ERROR", json.error_message);
  }

  return parseRoute(json.routes[0]);
}
