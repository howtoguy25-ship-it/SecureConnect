import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

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

export interface Map3DViewHandle {
  // Mirrors the 2D "Explore in 3D" joystick's direct-map-call semantics exactly (see
  // rotateStreet3D/tiltStreet3D in App.tsx) -- reads the element's current heading/tilt and
  // nudges it, rather than going through React state.
  rotate: (deltaDeg: number) => void;
  tilt: (deltaDeg: number) => void;
}

interface Props {
  // Mounted/unmounted (not just hidden) on this flag so re-activating later always starts
  // from a clean Map3DElement instead of reusing potentially-stale internal state.
  active: boolean;
  location: google.maps.LatLngLiteral | null;
  // The same ref the 2D follow-mode camera loop eases its own heading toward (see the rAF
  // loop in App.tsx) -- reused as-is rather than recomputed, so both views always agree on
  // where the camera should be pointing. Only actually applied while `follow` is on (see the
  // rAF effect below) -- during free-look "Explore in 3D" this ref sits stale/frozen, so
  // easing toward it unconditionally would fight the joystick/native drag every frame.
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
// Real photorealistic tiles stream in progressively -- starting the camera already close-in
// and steeply tilted (the actual target view) requests the most expensive, highest-detail
// tiles immediately, which can show as dark/undertextured placeholder geometry for a beat
// while they load. Constructing at a wider, flatter overview first and then easing down to
// the real target via flyCameraTo spreads that load out and gives the tiles a moment to
// stream in before the close/tilted view needs them.
const FLY_IN_DURATION_MS = 1200;

export const Map3DView = forwardRef<Map3DViewHandle, Props>(function Map3DView(
  { active, location, targetHeadingRef, tilt, follow, routePath, initialRange },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<google.maps.maps3d.Map3DElement | null>(null);
  const markerElRef = useRef<google.maps.maps3d.Marker3DElement | null>(null);
  const polylineElRef = useRef<google.maps.maps3d.Polyline3DElement | null>(null);
  const [isSteady, setIsSteady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // True for the duration of the mount-time flyCameraTo entrance animation (see below).
  // The recenter/tilt/heading effects further down all set camera properties directly and
  // fire on every GPS tick -- in a live-tracking scenario a tick almost always lands well
  // before the 1.2s fly-in finishes, and setting .center/.tilt/.heading directly while
  // flyCameraTo is still actively animating those same properties corrupts/cancels the
  // animation, leaving the camera permanently stuck in whatever odd intermediate framing it
  // was mid-transition through -- a flat, wrong-angle view that never resolves into the real
  // tilted chase view. Guarding those effects until the fly-in actually finishes fixes it.
  const flyingInRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      rotate: (deltaDeg: number) => {
        const map = mapElRef.current;
        if (!map) return;
        const current = map.heading ?? 0;
        map.heading = (current + deltaDeg + 360) % 360;
      },
      tilt: (deltaDeg: number) => {
        const map = mapElRef.current;
        if (!map) return;
        const current = map.tilt ?? 0;
        map.tilt = Math.max(0, Math.min(67.5, current + deltaDeg));
      },
    }),
    []
  );

  // Mount once when this view first becomes active. Waits for a real location rather than
  // ever falling back to a hardcoded {lat:0, lng:0} -- starting the camera at "Null Island"
  // for even a moment reads as a completely arbitrary, disorienting view snapping in before
  // correcting itself, not the driver's actual position.
  useEffect(() => {
    if (!active || !location || mapElRef.current || !containerRef.current) return;
    let cancelled = false;
    setIsSteady(false);
    setLoadError(false);

    google.maps
      .importLibrary("maps3d")
      .then((lib) => {
        if (cancelled || !containerRef.current) return;
        const { Map3DElement, Marker3DElement, Polyline3DElement, MapMode, AltitudeMode } = lib;

        const startCenter = location;
        const map = new Map3DElement({
          center: { lat: startCenter.lat, lng: startCenter.lng, altitude: 0 },
          heading: targetHeadingRef.current,
          tilt: 0,
          range: Math.max(initialRange * 3, 1500),
          mode: MapMode.HYBRID,
          gestureHandling: "GREEDY",
        });
        map.addEventListener("gmp-steadychange", (e) => {
          setIsSteady(e.isSteady);
          // A prior gmp-error doesn't necessarily mean the view is stuck broken -- a single
          // failed tile request can fire it even though the map goes on to render correctly
          // (real imagery, not a blank/broken view). Once the map reports steady again, treat
          // that as proof it actually recovered rather than leaving a stale "failed to load"
          // badge sitting over imagery that's now genuinely fine.
          if (e.isSteady) setLoadError(false);
        });
        map.addEventListener("gmp-error", () => setLoadError(true));
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

        flyingInRef.current = true;
        map.flyCameraTo({
          endCamera: { center: startCenter, heading: targetHeadingRef.current, tilt, range: initialRange },
          durationMillis: FLY_IN_DURATION_MS,
        });
        window.setTimeout(() => {
          flyingInRef.current = false;
        }, FLY_IN_DURATION_MS);
      })
      .catch((err) => {
        console.warn("[map3d] failed to load photorealistic 3D tiles", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
    // Boolean(location), not location itself -- this should only re-run the one time location
    // goes from absent to present while already active (e.g. GPS was still acquiring when 3D
    // was turned on), not on every subsequent lat/lng tick once it's mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, Boolean(location)]);

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
    if (follow && mapElRef.current && !flyingInRef.current) {
      mapElRef.current.center = { lat: location.lat, lng: location.lng, altitude: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, location?.lat, location?.lng, follow]);

  // Only reasserted while following -- during free-look "Explore in 3D" this would otherwise
  // fight the joystick/native two-finger tilt gesture every time the target prop's identity
  // changed, exactly like the 2D map's own tilt handling avoids doing outside follow mode.
  useEffect(() => {
    if (!active || !follow || !mapElRef.current || flyingInRef.current) return;
    mapElRef.current.tilt = tilt;
  }, [active, follow, tilt]);

  useEffect(() => {
    if (!active || !polylineElRef.current) return;
    polylineElRef.current.path = routePath ?? [];
  }, [active, routePath]);

  // Eases the camera heading toward targetHeadingRef every frame, mirroring the 2D
  // follow-mode camera loop's math exactly (same easing factor) so both views turn with
  // the same weighted, non-jump-cut feel. Gated on `follow` exactly like the 2D loop is
  // gated on navViewMode === "follow" -- outside follow mode targetHeadingRef sits frozen/
  // stale (nothing updates it), so easing toward it unconditionally would silently fight
  // every manual joystick/gesture rotation during free-look "Explore in 3D".
  useEffect(() => {
    if (!active || !follow) return;
    let rafId: number;
    let displayed = targetHeadingRef.current;

    function tick() {
      const map = mapElRef.current;
      if (map && !flyingInRef.current) {
        const current = displayed;
        const target = targetHeadingRef.current;
        const delta = ((target - current + 540) % 360) - 180;
        if (Math.abs(delta) > 0.05) {
          displayed = (current + delta * HEADING_EASE + 360) % 360;
          map.heading = displayed;
        }
      } else if (map) {
        // Keep the easing loop's own idea of "current heading" in sync with reality while
        // the fly-in owns the camera, so it doesn't snap once it hands control back.
        displayed = map.heading ?? displayed;
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, follow, targetHeadingRef]);

  return (
    <div ref={containerRef} className="map3d-overlay" style={{ display: active ? "block" : "none" }}>
      {active && loadError && (
        <div className="map3d-status map3d-status-error">
          3D satellite imagery failed to load
          <button
            className="map3d-status-dismiss"
            onClick={() => setLoadError(false)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {active && !loadError && !isSteady && <div className="map3d-status">Loading 3D imagery…</div>}
    </div>
  );
});
