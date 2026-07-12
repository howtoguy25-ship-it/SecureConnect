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
