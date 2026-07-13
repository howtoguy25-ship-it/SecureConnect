import { useEffect, useRef } from "react";

// Real photorealistic 3D satellite tiles via Google's newer, separate Maps JS API surface
// (google.maps.maps3d.Map3DElement, a Custom Element -- not part of the classic
// google.maps.Map/@react-google-maps/api component tree at all). This exists specifically
// because the classic flat satellite/hybrid raster imagery warps/squashes when tilted (no
// real building-height data behind the photo) -- this component swaps in real mesh-based
// 3D terrain/buildings instead, which tilts cleanly.
//
// Stage 1 of a deliberately staged build: core rendering + live position + the active route
// only. Traffic-light/speed-camera/alert markers are NOT drawn here yet -- those come in a
// later pass once this core view is confirmed actually rendering correctly on a real device
// (WebGL rendering can't be visually verified from this environment).
//
// Currently in Preview (free, no SLA) per Google's own docs as of mid-2026 -- expect this to
// need revisiting once it reaches General Availability and usage-based pricing kicks in.

interface Props {
  // Mounted/unmounted (not just hidden) on this flag so re-activating later always starts
  // from a clean Map3DElement instead of reusing potentially-stale internal state.
  active: boolean;
  location: google.maps.LatLngLiteral | null;
  // The same ref the 2D follow-mode camera loop eases its own heading toward (see the rAF
  // loop in App.tsx) -- reused as-is rather than recomputed, so both views always agree on
  // where the camera should be pointing.
  targetHeadingRef: React.MutableRefObject<number>;
  tilt: number;
  // Whether to keep recentering the camera on `location` as it updates (mirrors the 2D
  // map's panTo-every-tick behavior during follow-mode navigation). Off for free-look
  // "Explore in 3D" so the user's own pan/rotate isn't fought.
  follow: boolean;
  routePath: google.maps.LatLngLiteral[] | null;
  initialRange: number;
}

const HEADING_EASE = 0.14;

export function Map3DView({ active, location, targetHeadingRef, tilt, follow, routePath, initialRange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<google.maps.maps3d.Map3DElement | null>(null);
  const markerElRef = useRef<google.maps.maps3d.Marker3DElement | null>(null);
  const polylineElRef = useRef<google.maps.maps3d.Polyline3DElement | null>(null);

  // Mount once when this view first becomes active.
  useEffect(() => {
    if (!active || mapElRef.current || !containerRef.current) return;
    let cancelled = false;

    google.maps
      .importLibrary("maps3d")
      .then((lib) => {
        if (cancelled || !containerRef.current) return;
        const { Map3DElement, Marker3DElement, Polyline3DElement, MapMode, AltitudeMode } = lib;

        const startCenter = location ?? { lat: 0, lng: 0 };
        const map = new Map3DElement({
          center: { lat: startCenter.lat, lng: startCenter.lng, altitude: 0 },
          heading: targetHeadingRef.current,
          tilt,
          range: initialRange,
          mode: MapMode.HYBRID,
          gestureHandling: "GREEDY",
        });
        containerRef.current.appendChild(map);
        mapElRef.current = map;

        const marker = new Marker3DElement({
          position: startCenter,
          altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
        });
        map.appendChild(marker);
        markerElRef.current = marker;

        const polyline = new Polyline3DElement({
          path: routePath ?? [],
          altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
          strokeColor: "#2563EB",
          strokeWidth: 8,
          geodesic: true,
        });
        map.appendChild(polyline);
        polylineElRef.current = polyline;
      })
      .catch((err) => console.warn("[map3d] failed to load photorealistic 3D tiles", err));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Tear down on deactivation so a later reactivation gets a fresh element rather than
  // reusing one that may have been left in an unknown state.
  useEffect(() => {
    if (active) return;
    mapElRef.current?.remove();
    mapElRef.current = null;
    markerElRef.current = null;
    polylineElRef.current = null;
  }, [active]);

  useEffect(() => {
    return () => {
      mapElRef.current?.remove();
    };
  }, []);

  // Recenter + move the live-position marker as location updates. Only recenters the
  // camera while `follow` is on -- otherwise the marker still moves, but the user's own
  // free-look framing is left alone.
  useEffect(() => {
    if (!active || !location || !markerElRef.current) return;
    markerElRef.current.position = location;
    if (follow && mapElRef.current) {
      mapElRef.current.center = { lat: location.lat, lng: location.lng, altitude: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, location?.lat, location?.lng, follow]);

  useEffect(() => {
    if (!active || !mapElRef.current) return;
    mapElRef.current.tilt = tilt;
  }, [active, tilt]);

  useEffect(() => {
    if (!active || !polylineElRef.current) return;
    polylineElRef.current.path = routePath ?? [];
  }, [active, routePath]);

  // Eases the camera heading toward targetHeadingRef every frame, mirroring the 2D
  // follow-mode camera loop's math exactly (same easing factor) so both views turn with
  // the same weighted, non-jump-cut feel.
  useEffect(() => {
    if (!active) return;
    let rafId: number;
    let displayed = targetHeadingRef.current;

    function tick() {
      const map = mapElRef.current;
      if (map) {
        const current = displayed;
        const target = targetHeadingRef.current;
        const delta = ((target - current + 540) % 360) - 180;
        if (Math.abs(delta) > 0.05) {
          displayed = (current + delta * HEADING_EASE + 360) % 360;
          map.heading = displayed;
        }
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, targetHeadingRef]);

  return <div ref={containerRef} className="map3d-overlay" style={{ display: active ? "block" : "none" }} />;
}
