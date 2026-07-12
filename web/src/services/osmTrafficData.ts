import { distanceKm } from "@/utils/geo";

// Real traffic-signal and speed-camera locations from OpenStreetMap (via the public
// Overpass API) -- genuine community-mapped data, not a licensed government feed. Coverage
// is generally strong in mapped urban areas (including Sydney) but can have gaps
// elsewhere, and speed camera tagging in particular varies by region/legal sensitivity --
// treat this the same as the app's other crowd-sourced alerts: real, but not authoritative.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export interface OsmPoint {
  id: number;
  lat: number;
  lng: number;
}

export interface OsmTrafficData {
  trafficLights: OsmPoint[];
  speedCameras: OsmPoint[];
}

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export async function fetchOsmTrafficData(bounds: google.maps.LatLngBounds): Promise<OsmTrafficData> {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const bbox = `${sw.lat()},${sw.lng()},${ne.lat()},${ne.lng()}`;

  const query = `
    [out:json][timeout:20];
    (
      node["highway"="traffic_signals"](${bbox});
      node["highway"="speed_camera"](${bbox});
      node["enforcement"="maxspeed"](${bbox});
    );
    out body;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status}`);
  }

  const data: OverpassResponse = await response.json();
  const trafficLights: OsmPoint[] = [];
  const speedCameras: OsmPoint[] = [];

  for (const el of data.elements) {
    if (el.type !== "node") continue;
    const point: OsmPoint = { id: el.id, lat: el.lat, lng: el.lon };
    if (el.tags?.highway === "traffic_signals") {
      trafficLights.push(point);
    } else if (el.tags?.highway === "speed_camera" || el.tags?.enforcement === "maxspeed") {
      speedCameras.push(point);
    }
  }

  return { trafficLights, speedCameras };
}

export interface SpeedLimitResult {
  kmh: number;
  roadName: string | null;
}

const MPH_TO_KMH = 1.60934;
// How close the driver's GPS fix needs to be to a tagged road's centerline to trust it as
// "the road they're on" rather than a different nearby street (parallel road, service lane,
// etc). 40m covers normal GPS drift plus lane width without picking up an adjacent street.
const MAX_ROAD_MATCH_KM = 0.04;

// OSM's maxspeed tag is free text: plain numbers are km/h by convention almost everywhere
// this app is used (Australia, most of the world), "50 mph" for the few countries that tag
// speed in mph, and implicit values like "AU:urban" that carry no explicit number -- those
// are skipped rather than guessed at, since a wrong displayed limit is worse than none.
function parseMaxSpeedKmh(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.endsWith("mph")) {
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? Math.round(n * MPH_TO_KMH) : null;
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Shortest distance from a point to a line segment, in km. Uses a local equirectangular
// projection (treats a small patch of the globe as flat) which is accurate to well under a
// meter at road-segment scale -- more than good enough for a 40m match threshold.
function pointToSegmentDistanceKm(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const ax = (aLng - pLng) * cosLat;
  const ay = aLat - pLat;
  const bx = (bLng - pLng) * cosLat;
  const by = bLat - pLat;
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (-ax * abx + -ay * aby) / lenSq));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return distanceKm(pLat, pLng, pLat + closestY, pLng + closestX / cosLat);
}

interface OverpassGeomElement extends OverpassElement {
  geometry?: { lat: number; lon: number }[];
}

interface OverpassGeomResponse {
  elements: OverpassGeomElement[];
}

/** Finds the real, OSM-tagged posted speed limit for whichever road is closest to the given
 *  point (normally the driver's live GPS fix), or null if no tagged road is close enough / no
 *  nearby road has an explicit maxspeed. Same "real, community-mapped, not an official feed"
 *  caveat as the traffic-light/speed-camera layer above. */
export async function fetchSpeedLimitNear(lat: number, lng: number): Promise<SpeedLimitResult | null> {
  const query = `
    [out:json][timeout:15];
    way["highway"]["maxspeed"](around:120,${lat},${lng});
    out geom;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status}`);
  }

  const data: OverpassGeomResponse = await response.json();
  let best: { distanceKm: number; kmh: number; roadName: string | null } | null = null;

  for (const way of data.elements) {
    if (way.type !== "way" || !way.geometry || !way.tags?.maxspeed) continue;
    const kmh = parseMaxSpeedKmh(way.tags.maxspeed);
    if (kmh === null) continue;

    let minDist = Infinity;
    for (let i = 0; i < way.geometry.length - 1; i++) {
      const a = way.geometry[i];
      const b = way.geometry[i + 1];
      const d = pointToSegmentDistanceKm(lat, lng, a.lat, a.lon, b.lat, b.lon);
      if (d < minDist) minDist = d;
    }

    if (minDist < MAX_ROAD_MATCH_KM && (!best || minDist < best.distanceKm)) {
      best = { distanceKm: minDist, kmh, roadName: way.tags.name ?? null };
    }
  }

  return best ? { kmh: best.kmh, roadName: best.roadName } : null;
}
