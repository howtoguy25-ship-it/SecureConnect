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
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function getDirections(origin: LatLng, destination: LatLng): Promise<Route> {
  const url =
    "https://maps.googleapis.com/maps/api/directions/json" +
    `?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}` +
    `&mode=driving&key=${env.googleDirectionsApiKey}`;

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

  return {
    polyline: decodePolyline(route.overview_polyline.points),
    steps,
    distanceMeters: leg.distance?.value ?? 0,
    durationSeconds: leg.duration?.value ?? 0,
    etaText: leg.duration?.text ?? "",
    distanceText: leg.distance?.text ?? "",
  };
}
