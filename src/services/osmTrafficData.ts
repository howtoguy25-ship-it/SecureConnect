// Real traffic-signal and speed-camera locations from OpenStreetMap (via the public
// Overpass API) -- genuine community-mapped data, not a licensed government feed. Coverage
// is generally strong in mapped urban areas but can have gaps elsewhere, and speed camera
// tagging in particular varies by region/legal sensitivity -- treat this the same as the
// app's other crowd-sourced alerts: real, but not authoritative. Mirrors the web app's
// services/osmTrafficData.ts (fetchOsmTrafficData half only -- the mobile map doesn't yet
// have a posted-speed-limit readout to pair with fetchSpeedLimitNear).
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
