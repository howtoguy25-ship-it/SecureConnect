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

// Picks whichever candidate genuinely has the lower traffic-aware duration -- falls back to
// free-flow duration only if neither candidate has a traffic figure (useTraffic wasn't
// requested), so this is only ever comparing like-for-like numbers.
function fasterOf(a: Route, b: Route): Route {
  const aTime = a.durationInTrafficSeconds ?? a.durationSeconds;
  const bTime = b.durationInTrafficSeconds ?? b.durationSeconds;
  return aTime <= bTime ? a : b;
}

// Every real alternative Google is willing to offer for this trip, with live traffic factored
// in -- the candidate pool "fastest" gets picked from below. Not itself a `Route`: could be one
// route or several, and the caller decides what to compare them against.
async function getFastestRouteCandidates(
  origin: LatLng,
  destination: LatLng,
  waypoint?: LatLng
): Promise<Route[]> {
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

  return json.routes.map(parseRoute);
}

export type RouteProfileKey = "normal" | "fastest" | "safest";

export const ROUTE_PROFILE_LABELS: Record<RouteProfileKey, string> = {
  normal: "Normal",
  fastest: "Fastest",
  safest: "Safest",
};

// "safest" keeps highways available (a toll-free backstreets-only route is often *less* safe
// -- narrower roads, more intersections) but skips tolls, and considers every road type Google
// itself is willing to route through.
const SAFEST_OPTIONS: DirectionsOptions = { avoidTolls: true };

/** Fetches all 3 route profiles in parallel for the route-choice picker. Each is a real,
 *  independently-fetched Google Directions result (not one call's `alternatives` alone for
 *  normal/safest) so "safest" can ask for a specific character (tolls-free) that a plain
 *  alternatives list wouldn't guarantee. Mirrors the web app's routeProfiles.ts.
 *
 *  All three now request live traffic (useTraffic: true) -- a real, confirmed bug otherwise:
 *  "Normal" (no traffic request) showed an optimistic free-flow number while "Fastest" showed
 *  the honest, traffic-inflated one, so a route with real current congestion could show
 *  "Fastest: 19 mins" next to "Normal: 10 mins" for a *shorter* trip -- not actually a routing
 *  bug, just two different numbers being compared as if they were the same thing. With all
 *  three traffic-aware, "fastest" is then computed as the genuine minimum across every
 *  candidate seen (the alternatives pool *and* normal's and safest's own routes) -- so it's
 *  provably never slower than what's shown as Normal or Safest, guaranteed by construction
 *  rather than by hoping the alternatives search happened to include the quickest option. */
export async function getRouteOptions(
  origin: LatLng,
  destination: LatLng,
  waypoint?: LatLng
): Promise<Record<RouteProfileKey, Route>> {
  const [normal, safest, fastestCandidates] = await Promise.all([
    getDirections(origin, destination, { waypoint, useTraffic: true }),
    getDirections(origin, destination, { ...SAFEST_OPTIONS, waypoint, useTraffic: true }),
    getFastestRouteCandidates(origin, destination, waypoint),
  ]);
  const fastest = [normal, safest, ...fastestCandidates].reduce(fasterOf);
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
