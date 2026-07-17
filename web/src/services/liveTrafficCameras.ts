// Real NSW live traffic camera data, sourced from a public mirror of Transport for NSW's
// official "Live Traffic Cameras" open dataset (opendata.transport.nsw.gov.au). The official
// TfNSW Open Data Hub endpoint requires a free developer account + API key to query directly;
// this OpenDataSoft-hosted mirror re-publishes the same government dataset and is queryable
// without one, which is why it's used here. Camera images are refreshed by TfNSW roughly
// every 60 seconds -- see refreshLiveCameraImageUrl below for how that's reflected here.
//
// This is intentionally scoped to *viewing* cameras for road/traffic-condition awareness
// only -- no vehicle detection, no license plate reading, no cross-camera tracking. NSW's
// ~197 fixed traffic cameras are a small, near-static dataset (locations basically never
// change), so this fetches the full list once rather than re-querying per map pan.
const CAMERAS_API_URL = "https://australiademo.opendatasoft.com/api/records/1.0/search/";

export interface LiveTrafficCamera {
  id: string;
  lat: number;
  lng: number;
  title: string;
  view: string | null;
  direction: string | null;
  imageUrl: string;
}

interface OpenDataSoftRecord {
  recordid: string;
  fields: {
    title?: string;
    geo_point_2d?: [number, number];
    href?: string;
    view?: string;
    direction?: string;
  };
}

interface OpenDataSoftResponse {
  records: OpenDataSoftRecord[];
}

let cachedCameras: LiveTrafficCamera[] | null = null;
let inFlight: Promise<LiveTrafficCamera[]> | null = null;

export async function fetchLiveTrafficCameras(): Promise<LiveTrafficCamera[]> {
  if (cachedCameras) return cachedCameras;
  if (inFlight) return inFlight;

  inFlight = fetch(`${CAMERAS_API_URL}?dataset=live-traffic-cameras&rows=300`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Live traffic camera API returned ${response.status}`);
      }
      return response.json() as Promise<OpenDataSoftResponse>;
    })
    .then((data) => {
      const cameras: LiveTrafficCamera[] = [];
      for (const record of data.records) {
        const { fields } = record;
        if (!fields.geo_point_2d || !fields.href) continue;
        cameras.push({
          id: record.recordid,
          lat: fields.geo_point_2d[0],
          lng: fields.geo_point_2d[1],
          title: fields.title ?? "Traffic camera",
          view: fields.view ?? null,
          direction: fields.direction ?? null,
          imageUrl: fields.href,
        });
      }
      cachedCameras = cameras;
      return cameras;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

// TfNSW republishes each camera's image in place at the same URL roughly every 60 seconds --
// appending a cache-busting query param on each refresh is what actually forces the browser
// to fetch the new frame instead of reusing whatever it already has cached for that URL.
export function refreshLiveCameraImageUrl(imageUrl: string): string {
  const separator = imageUrl.includes("?") ? "&" : "?";
  return `${imageUrl}${separator}t=${Date.now()}`;
}
