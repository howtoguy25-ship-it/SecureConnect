const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(latitude: number, longitude: number, precision = 9): string {
  const latRange: [number, number] = [-90, 90];
  const lonRange: [number, number] = [-180, 180];
  let hash = "";
  let isEven = true;
  let bit = 0;
  let ch = 0;

  while (hash.length < precision) {
    if (isEven) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (longitude > mid) {
        ch |= 1 << (4 - bit);
        lonRange[0] = mid;
      } else {
        lonRange[1] = mid;
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (latitude > mid) {
        ch |= 1 << (4 - bit);
        latRange[0] = mid;
      } else {
        latRange[1] = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

interface GeohashBbox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

function decodeGeohashBbox(hash: string): GeohashBbox {
  const latRange: [number, number] = [-90, 90];
  const lonRange: [number, number] = [-180, 180];
  let isEven = true;

  for (const c of hash) {
    const idx = BASE32.indexOf(c);
    for (let n = 4; n >= 0; n--) {
      const bitN = (idx >> n) & 1;
      if (isEven) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        if (bitN === 1) lonRange[0] = mid;
        else lonRange[1] = mid;
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        if (bitN === 1) latRange[0] = mid;
        else latRange[1] = mid;
      }
      isEven = !isEven;
    }
  }
  return { latMin: latRange[0], latMax: latRange[1], lonMin: lonRange[0], lonMax: lonRange[1] };
}

const PRECISION_CELL_KM: { precision: number; km: number }[] = [
  { precision: 1, km: 2500 },
  { precision: 2, km: 630 },
  { precision: 3, km: 78 },
  { precision: 4, km: 20 },
  { precision: 5, km: 2.4 },
  { precision: 6, km: 0.61 },
  { precision: 7, km: 0.076 },
];

function precisionForRadiusKm(radiusKm: number): number {
  for (const { precision, km } of PRECISION_CELL_KM) {
    if (km >= radiusKm) return precision;
  }
  return PRECISION_CELL_KM[PRECISION_CELL_KM.length - 1].precision;
}

function neighborHash(hash: string, dLat: 1 | 0 | -1, dLon: 1 | 0 | -1): string {
  const { latMin, latMax, lonMin, lonMax } = decodeGeohashBbox(hash);
  const latErr = latMax - latMin;
  const lonErr = lonMax - lonMin;
  const centerLat = (latMin + latMax) / 2;
  const centerLon = (lonMin + lonMax) / 2;

  let lat = centerLat + dLat * latErr;
  let lon = centerLon + dLon * lonErr;
  lat = Math.max(-90, Math.min(90, lat));
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return encodeGeohash(lat, lon, hash.length);
}

export function geohashQueryBounds(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): [string, string][] {
  const precision = precisionForRadiusKm(radiusKm);
  const centerHash = encodeGeohash(centerLat, centerLng, precision);

  const deltas: [1 | 0 | -1, 1 | 0 | -1][] = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  const hashes = new Set<string>();
  for (const [dLat, dLon] of deltas) {
    hashes.add(dLat === 0 && dLon === 0 ? centerHash : neighborHash(centerHash, dLat, dLon));
  }

  return Array.from(hashes).map((h) => [h, h + "~"]);
}

/** Great-circle initial bearing from point 1 to point 2, in degrees (0 = north, 90 = east). */
export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Shortest distance in meters from a point to a polyline (the minimum over every segment's
 *  point-to-segment distance) -- the real signal for "has the driver actually left the route,"
 *  not just "how far from where the route was last computed" (which fires identically whether
 *  the driver is perfectly on-route or has missed a turn entirely, since it only measures
 *  distance travelled, not distance *off* the route line). Uses a flat-plane equirectangular
 *  approximation (fine at the tens/hundreds-of-meters scale this is used at, not meant for
 *  long-distance navigation math the way distanceKm's real haversine calculation above is). */
export function distanceToPolylineMeters(
  lat: number,
  lon: number,
  polyline: { lat: number; lng: number }[]
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return distanceKm(lat, lon, polyline[0].lat, polyline[0].lng) * 1000;
  }

  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const px = lon * metersPerDegLon;
  const py = lat * metersPerDegLat;

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a.lng * metersPerDegLon;
    const ay = a.lat * metersPerDegLat;
    const bx = b.lng * metersPerDegLon;
    const by = b.lat * metersPerDegLat;

    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSq)) : 0;
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const dist = Math.hypot(px - cx, py - cy);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
