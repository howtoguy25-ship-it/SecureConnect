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

/** Walks forward along a polyline starting from the point on it nearest (lat, lon), returning
 *  the lat/lng reached after `meters` of travel along the line -- "the point 1km ahead on the
 *  route from here," not just some fixed vertex. Used to scope the traffic-jam check to a
 *  near-term window ahead of the driver (per explicit request: "traffic ... from their
 *  location live -to 1km") instead of averaging delay over the whole remaining trip. Returns
 *  null if the polyline ends before `meters` is covered (remaining route is shorter than the
 *  window -- the whole-route check already covers that case). Mirrors mobile's own
 *  pointAheadOnPolylineMeters exactly, just against {lat,lng} instead of {latitude,longitude}.
 */
export function pointAheadOnPolylineMeters(
  lat: number,
  lon: number,
  polyline: { lat: number; lng: number }[],
  meters: number
): { lat: number; lng: number } | null {
  if (polyline.length < 2) return null;

  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const px = lon * metersPerDegLon;
  const py = lat * metersPerDegLat;

  let bestIndex = 0;
  let bestT = 0;
  let bestDist = Infinity;
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
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
      bestT = t;
    }
  }

  const segStart = polyline[bestIndex];
  const segEnd = polyline[bestIndex + 1];
  let cursor = {
    lat: segStart.lat + bestT * (segEnd.lat - segStart.lat),
    lng: segStart.lng + bestT * (segEnd.lng - segStart.lng),
  };
  let cursorIndex = bestIndex;
  let segRemainingMeters = distanceKm(cursor.lat, cursor.lng, segEnd.lat, segEnd.lng) * 1000;

  let remaining = meters;
  while (remaining > segRemainingMeters) {
    remaining -= segRemainingMeters;
    cursorIndex += 1;
    if (cursorIndex >= polyline.length - 1) return null;
    cursor = polyline[cursorIndex];
    const next = polyline[cursorIndex + 1];
    segRemainingMeters = distanceKm(cursor.lat, cursor.lng, next.lat, next.lng) * 1000;
  }

  const next = polyline[cursorIndex + 1];
  const frac = segRemainingMeters > 0 ? remaining / segRemainingMeters : 0;
  return {
    lat: cursor.lat + frac * (next.lat - cursor.lat),
    lng: cursor.lng + frac * (next.lng - cursor.lng),
  };
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
