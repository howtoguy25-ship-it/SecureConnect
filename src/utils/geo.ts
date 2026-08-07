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

/** Initial compass bearing (0-360, 0 = north) from point 1 to point 2 -- real great-circle
 *  bearing, not a flat-plane approximation, so it stays accurate at any latitude. */
export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Shortest distance in meters from a point to a polyline (the minimum over every segment's
 *  point-to-segment distance) -- the real signal for "has the driver actually left the route,"
 *  not just "is the current step's endpoint getting farther away" (which never fires at all if
 *  a missed turn/exit sends the driver somewhere the remaining steps never happen to pass near).
 *  Uses a flat-plane equirectangular approximation (fine at the tens/hundreds-of-meters scale
 *  this is used at -- not meant for long-distance navigation math the way distanceKm's real
 *  haversine calculation above is). */
export function distanceToPolylineMeters(
  lat: number,
  lon: number,
  polyline: { latitude: number; longitude: number }[]
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return distanceKm(lat, lon, polyline[0].latitude, polyline[0].longitude) * 1000;
  }

  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const px = lon * metersPerDegLon;
  const py = lat * metersPerDegLat;

  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const ax = a.longitude * metersPerDegLon;
    const ay = a.latitude * metersPerDegLat;
    const bx = b.longitude * metersPerDegLon;
    const by = b.latitude * metersPerDegLat;

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
