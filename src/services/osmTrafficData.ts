import { distanceKm } from "@/utils/geo";

// Real traffic-signal and speed-camera locations from OpenStreetMap (via the public
// Overpass API) -- genuine community-mapped data, not a licensed government feed. Coverage
// is generally strong in mapped urban areas but can have gaps elsewhere, and speed camera
// tagging in particular varies by region/legal sensitivity -- treat this the same as the
// app's other crowd-sourced alerts: real, but not authoritative. Also mirrors the web app's
// services/osmTrafficData.ts fetchSpeedLimitNear (see below) -- the posted speed-limit
// readout for whichever road the driver is currently on.
//
// Multiple independent public mirrors, not just overpass-api.de -- confirmed by directly
// querying it that the single default instance genuinely times out under load ("The server is
// probably too busy to handle your request", a real HTTP 504 from Overpass itself, not a app
// bug), which is exactly why most areas were coming back empty ("none of the traffic lights
// load, only one area" -- that one area was just the lucky request that beat the timeout).
// All mirrors are queried in parallel and whichever answers first wins; the rest are aborted.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

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

export interface LatLngBoundsPlain {
  sw: { latitude: number; longitude: number };
  ne: { latitude: number; longitude: number };
}

export interface FetchOsmOptions {
  wantTrafficLights: boolean;
  wantSpeedCameras: boolean;
}

// Render-cost caps -- a fully zoomed-out view over a dense city could otherwise return
// thousands of nodes and stall the map's marker layer.
const MAX_TRAFFIC_LIGHTS = 4000;
const MAX_SPEED_CAMERAS = 2000;

// The public Overpass instance is a free, shared, unauthenticated service -- it can
// genuinely take several seconds under load, with no SLA. A hard client-side timeout means
// a slow/hung request fails visibly and lets the debounced fetch on the next pan/zoom retry,
// instead of leaving the layer looking permanently stuck with no feedback.
const FETCH_TIMEOUT_MS = 12000;

// In-memory only (cleared on app restart) -- panning back and forth over the same block
// shouldn't re-hit the network every time. Keyed by rounded bbox + which layers were asked
// for, so toggling a layer on doesn't serve a stale cache missing that data.
const cache = new Map<string, OsmTrafficData>();

function cacheKey(bounds: LatLngBoundsPlain, options: FetchOsmOptions): string {
  const round = (n: number) => n.toFixed(3);
  return `${round(bounds.sw.latitude)},${round(bounds.sw.longitude)},${round(bounds.ne.latitude)},${round(bounds.ne.longitude)}|${options.wantTrafficLights ? "t" : ""}${options.wantSpeedCameras ? "s" : ""}`;
}

export async function fetchOsmTrafficData(
  bounds: LatLngBoundsPlain,
  options: FetchOsmOptions
): Promise<OsmTrafficData> {
  const key = cacheKey(bounds, options);
  const cached = cache.get(key);
  if (cached) return cached;

  const bbox = `${bounds.sw.latitude},${bounds.sw.longitude},${bounds.ne.latitude},${bounds.ne.longitude}`;

  // Only query for the node types actually needed -- if only one layer is toggled on,
  // there's no reason to make Overpass search, transfer, and have us parse the other.
  const clauses: string[] = [];
  if (options.wantTrafficLights) {
    clauses.push(`node["highway"="traffic_signals"](${bbox});`);
  }
  if (options.wantSpeedCameras) {
    clauses.push(`node["highway"="speed_camera"](${bbox});`);
    clauses.push(`node["enforcement"="maxspeed"](${bbox});`);
  }
  if (clauses.length === 0) return { trafficLights: [], speedCameras: [] };

  const query = `[out:json][timeout:25];(${clauses.join("")});out body;`;
  const body = `data=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const requestFrom = async (endpoint: string): Promise<OverpassResponse> => {
    const response = await fetch(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${endpoint} returned ${response.status}`);
    }
    return response.json();
  };

  let data: OverpassResponse;
  try {
    data = await Promise.any(OVERPASS_ENDPOINTS.map(requestFrom));
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("Traffic light/speed camera lookup timed out -- try panning the map again");
    }
    throw new Error("Traffic light/speed camera lookup failed -- all data sources unavailable");
  } finally {
    clearTimeout(timeoutHandle);
    // Whichever mirror answered first has already resolved `data` above -- abort the rest so
    // they don't keep doing work for a result nothing will use.
    controller.abort();
  }

  const trafficLights: OsmPoint[] = [];
  const speedCameras: OsmPoint[] = [];

  for (const el of data.elements) {
    if (el.type !== "node") continue;
    const point: OsmPoint = { id: el.id, lat: el.lat, lng: el.lon };
    if (el.tags?.highway === "traffic_signals") {
      if (trafficLights.length < MAX_TRAFFIC_LIGHTS) trafficLights.push(point);
    } else if (el.tags?.highway === "speed_camera" || el.tags?.enforcement === "maxspeed") {
      if (speedCameras.length < MAX_SPEED_CAMERAS) speedCameras.push(point);
    }
  }

  const result = { trafficLights, speedCameras };
  cache.set(key, result);
  return result;
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
const SPEED_LIMIT_FETCH_TIMEOUT_MS = 8000;

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
 *  caveat as the traffic-light/speed-camera layer above -- and the same multi-mirror fetch
 *  pattern (see OVERPASS_ENDPOINTS) so one slow/overloaded Overpass instance doesn't block the
 *  reading from updating as the driver moves onto a new road. */
export async function fetchSpeedLimitNear(lat: number, lng: number): Promise<SpeedLimitResult | null> {
  const query = `[out:json][timeout:15];way["highway"]["maxspeed"](around:120,${lat},${lng});out geom;`;
  const body = `data=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), SPEED_LIMIT_FETCH_TIMEOUT_MS);

  const requestFrom = async (endpoint: string): Promise<OverpassGeomResponse> => {
    const response = await fetch(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${endpoint} returned ${response.status}`);
    return response.json();
  };

  let data: OverpassGeomResponse;
  try {
    data = await Promise.any(OVERPASS_ENDPOINTS.map(requestFrom));
  } catch {
    // Best-effort -- a missed lookup just means the badge doesn't update this tick, retried
    // automatically on the next GPS move (see MapScreen.tsx's throttled refetch effect).
    return null;
  } finally {
    clearTimeout(timeoutHandle);
    controller.abort();
  }

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
