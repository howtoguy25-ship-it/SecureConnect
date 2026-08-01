// Simple grid-bucket clustering -- groups nearby points into a single cluster marker so a
// dense real-world layer (a city intersection can have 10+ traffic-light nodes within a
// couple hundred meters) never renders more individual react-native-maps <Marker> host views
// than the current zoom level can actually show as distinct pins. That marker *count* is what
// was actually causing map lag, not the underlying data fetch -- so this trims render count,
// not fetch radius.
export interface ClusterablePoint {
  id: string | number;
  lat: number;
  lng: number;
}

export interface PointCluster<T extends ClusterablePoint> {
  key: string;
  lat: number;
  lng: number;
  count: number;
  points: T[];
}

export function clusterPoints<T extends ClusterablePoint>(
  points: T[],
  cellSizeDegrees: number
): PointCluster<T>[] {
  const buckets = new Map<string, T[]>();
  for (const p of points) {
    const cx = Math.round(p.lat / cellSizeDegrees);
    const cy = Math.round(p.lng / cellSizeDegrees);
    const key = `${cx}:${cy}`;
    const existing = buckets.get(key);
    if (existing) existing.push(p);
    else buckets.set(key, [p]);
  }

  const clusters: PointCluster<T>[] = [];
  for (const [key, pts] of buckets) {
    const lat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
    const lng = pts.reduce((sum, p) => sum + p.lng, 0) / pts.length;
    clusters.push({ key, lat, lng, count: pts.length, points: pts });
  }
  return clusters;
}
