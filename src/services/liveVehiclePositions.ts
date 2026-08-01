import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { env } from "@/config/env";
import type { LatLng } from "@/utils/polyline";
import { distanceKm } from "@/utils/geo";
import { Sentry } from "@/services/sentry";

// Real Transport for NSW Open Data GTFS-realtime feeds -- see the API's own Swagger spec
// (basePath /v1/gtfs/vehiclepos). Only the feeds relevant to where this app is actually used
// (Sydney/NSW, matching the rest of the app's AU-first assumptions -- see the OSM traffic
// layer, the "NSW-only" note in Settings) are listed here; the region-bus feeds
// (centralwestandorana, farwest, etc.) can be added the same way if ever needed.
export type NswTransitFeed = "buses" | "nswtrains" | "lightrail-cbd-southeast" | "ferries-sydney";

const FEED_PATHS: Record<NswTransitFeed, string> = {
  buses: "/buses",
  nswtrains: "/nswtrains",
  "lightrail-cbd-southeast": "/lightrail/cbdandsoutheast",
  "ferries-sydney": "/ferries/sydneyferries",
};

const BASE_URL = "https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos";

export interface LiveVehiclePosition {
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  location: LatLng;
  bearingDeg?: number;
  speedMps?: number;
  timestampMs?: number;
}

/** True only once a real key has actually been configured -- every caller should check this
 *  (or just call fetchLiveVehiclePositions and get an empty array back either way) rather than
 *  assuming live tracking is available, since it's a genuinely optional feature the rest of
 *  the app works fully without. */
export function hasLiveTransitTracking(): boolean {
  return env.nswTransportApiKey.length > 0;
}

/** Fetches and decodes one GTFS-realtime VehiclePositions feed, optionally filtered down to
 *  vehicles within `radiusKm` of `near`. Returns an empty array (never throws) whenever live
 *  tracking isn't configured or the request fails -- this is a real bonus signal layered on
 *  top of the schedule-based transit ETAs the app already shows, never something a caller
 *  should treat as required for Transit mode to work. */
export async function fetchLiveVehiclePositions(
  feed: NswTransitFeed,
  near?: LatLng,
  radiusKm = 5
): Promise<LiveVehiclePosition[]> {
  if (!hasLiveTransitTracking()) return [];

  try {
    const res = await fetch(`${BASE_URL}${FEED_PATHS[feed]}`, {
      headers: { Authorization: `apikey ${env.nswTransportApiKey}` },
    });
    if (!res.ok) {
      Sentry.logger.error("liveVehiclePositions: request failed", {
        feed,
        status: res.status,
        statusText: res.statusText,
      });
      return [];
    }
    const buffer = await res.arrayBuffer();
    const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    const positions: LiveVehiclePosition[] = [];
    for (const entity of message.entity) {
      const v = entity.vehicle;
      const pos = v?.position;
      if (!v || !pos) continue;
      const location = { latitude: pos.latitude, longitude: pos.longitude };
      if (near && distanceKm(near.latitude, near.longitude, location.latitude, location.longitude) > radiusKm) {
        continue;
      }
      positions.push({
        vehicleId: v.vehicle?.id ?? entity.id,
        tripId: v.trip?.tripId ?? undefined,
        routeId: v.trip?.routeId ?? undefined,
        location,
        bearingDeg: pos.bearing ?? undefined,
        speedMps: pos.speed ?? undefined,
        timestampMs: v.timestamp ? Number(v.timestamp) * 1000 : undefined,
      });
    }
    return positions;
  } catch (err) {
    Sentry.logger.error("liveVehiclePositions: fetch/decode failed", { feed, error: String(err) });
    console.warn("[liveVehiclePositions] fetch/decode failed", err);
    return [];
  }
}
