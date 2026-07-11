import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Autocomplete,
  DirectionsRenderer,
} from "@react-google-maps/api";
import type { User } from "firebase/auth";
import { ensureSignedIn } from "@/services/firebase";
import {
  subscribeNearbyAlerts,
  subscribeAllAlerts,
  reportAlert,
  deleteAlert,
  hideAlertForUser,
  confirmAlert,
} from "@/services/alerts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSettings } from "@/hooks/useSettings";
import { ReportAlertPanel } from "@/components/ReportAlertPanel";
import { AlertDetailPanel } from "@/components/AlertDetailPanel";
import { PlacementBar } from "@/components/PlacementBar";
import { NavigationCard, type NavViewMode } from "@/components/NavigationCard";
import { RouteOptionsCard } from "@/components/RouteOptionsCard";
import { StreetViewNav } from "@/components/StreetViewNav";
import { ConfirmPrompt } from "@/components/ConfirmPrompt";
import { ROUTE_PROFILES, type RouteKey } from "@/utils/routeProfiles";
// Lazy-loaded: pulls in TensorFlow.js + COCO-SSD (~2MB), so keep it out of the initial bundle.
const LiveVehicleDetection = lazy(() =>
  import("@/components/LiveVehicleDetection").then((m) => ({ default: m.LiveVehicleDetection }))
);
import { ALERT_COLORS, ALERT_EMOJI, type AlertDoc, type AlertType } from "@/types/alert";
import { bearingDegrees, distanceKm } from "@/utils/geo";
import "./App.css";

const LIBRARIES: "places"[] = ["places"];
const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };
// Re-fetch directions from the live position while navigating once you've drifted this
// far from where the route was last computed — keeps ETA/remaining-distance accurate
// without hammering the Directions API on every GPS tick.
const REROUTE_THRESHOLD_KM = 0.05;

function markerIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 12,
  };
}

export default function App() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const { location, error: locationError } = useGeolocation();
  const { settings, setAlertRadiusKm, setRegionWide, setFixedZone } = useSettings();
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AlertDoc[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDoc | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [detectionOpen, setDetectionOpen] = useState(false);

  const [destination, setDestination] = useState<google.maps.LatLngLiteral | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeOptions, setRouteOptions] = useState<Record<RouteKey, google.maps.DirectionsResult | null>>({
    best: null,
    fast: null,
    comfort: null,
  });
  const [selectedRouteKey, setSelectedRouteKey] = useState<RouteKey>("best");
  const [routeOrigin, setRouteOrigin] = useState<google.maps.LatLngLiteral | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Manual alert placement: pick a type, then tap/drag on the map to choose where the
  // report actually goes, instead of always using your current GPS fix.
  const [pendingType, setPendingType] = useState<AlertType | null>(null);
  const [pendingLocation, setPendingLocation] = useState<google.maps.LatLngLiteral | null>(null);

  // Live turn-by-turn navigation
  const [navigating, setNavigating] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [heading, setHeading] = useState(0);
  // "follow" = tilted, rotating, close-up camera that tracks your heading (driving view);
  // "street" = real Google Street View imagery facing your direction of travel (front/driver view);
  // "overview" = flat, north-up, zoomed out to show the entire route start-to-finish.
  const [navViewMode, setNavViewMode] = useState<NavViewMode>("follow");
  const [distanceToManeuverM, setDistanceToManeuverM] = useState<number | null>(null);
  const [streetViewUnavailable, setStreetViewUnavailable] = useState(false);
  const lastLocationRef = useRef<google.maps.LatLngLiteral | null>(null);

  // Max-zoom "view in 3D?" prompt
  const [maxZoomHere, setMaxZoomHere] = useState<number | null>(null);
  const [show3DPrompt, setShow3DPrompt] = useState(false);
  const [street3DMode, setStreet3DMode] = useState(false);
  const promptedAtMaxZoomRef = useRef(false);

  // Fixed alert zone
  const [zoneCenter, setZoneCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [showLeaveZonePrompt, setShowLeaveZonePrompt] = useState(false);
  const leaveZonePromptedRef = useRef(false);

  useEffect(() => {
    ensureSignedIn()
      .then(setUser)
      .catch((err) => {
        console.warn("[auth] anonymous sign-in failed", err);
        const code = err instanceof Object && "code" in err ? String((err as any).code) : null;
        setAuthError(`Couldn't sign in: ${code ?? (err instanceof Error ? err.message : String(err))}`);
      });
  }, []);

  useEffect(() => {
    if (!user) return;

    if (settings.regionWide) {
      return subscribeAllAlerts(user.uid, setAlerts);
    }

    const queryCenter = settings.fixedZone ? zoneCenter ?? location : location;
    if (!queryCenter) return;

    return subscribeNearbyAlerts(
      queryCenter.lat,
      queryCenter.lng,
      settings.alertRadiusKm,
      user.uid,
      setAlerts
    );
  }, [
    location?.lat,
    location?.lng,
    settings.alertRadiusKm,
    settings.regionWide,
    settings.fixedZone,
    zoneCenter?.lat,
    zoneCenter?.lng,
    user?.uid,
  ]);

  // Seed the fixed zone's center the moment it's turned on; clear it when turned off so
  // it re-seeds fresh next time instead of reusing a stale spot.
  useEffect(() => {
    if (settings.fixedZone && !zoneCenter && location) {
      setZoneCenter(location);
      leaveZonePromptedRef.current = false;
    }
    if (!settings.fixedZone && zoneCenter) {
      setZoneCenter(null);
      setShowLeaveZonePrompt(false);
    }
  }, [settings.fixedZone, zoneCenter, location]);

  // Watch for drifting outside the fixed zone's radius and prompt once per "leaving" event.
  useEffect(() => {
    if (!settings.fixedZone || !zoneCenter || !location) return;
    const distFromZoneKm = distanceKm(zoneCenter.lat, zoneCenter.lng, location.lat, location.lng);
    if (distFromZoneKm > settings.alertRadiusKm) {
      if (!leaveZonePromptedRef.current) {
        leaveZonePromptedRef.current = true;
        setShowLeaveZonePrompt(true);
      }
    } else {
      leaveZonePromptedRef.current = false;
    }
  }, [location?.lat, location?.lng, settings.fixedZone, settings.alertRadiusKm, zoneCenter]);

  // Compute/refresh directions. Before navigating, this fetches three real, distinctly
  // -constrained routes (Best/Fast/Comfort) so the route picker has real options to show.
  // While navigating, it only re-fetches whichever profile is already selected — live
  // re-routing (see the drift-triggered update further down) shouldn't silently swap the
  // route's character mid-drive, and refetching all three every reroute would be wasteful.
  useEffect(() => {
    const origin = routeOrigin ?? location;
    if (!origin || !destination) {
      setRouteOptions({ best: null, fast: null, comfort: null });
      setDirections(null);
      return;
    }
    const directionsService = new google.maps.DirectionsService();

    if (navigating) {
      const profile = ROUTE_PROFILES[selectedRouteKey];
      directionsService.route(
        {
          origin,
          destination,
          travelMode: google.maps.TravelMode.DRIVING,
          avoidHighways: profile.avoidHighways,
          avoidTolls: profile.avoidTolls,
        },
        (result, status) => {
          if (status === "OK" && result) {
            setDirections(result);
            setRouteOptions((prev) => ({ ...prev, [selectedRouteKey]: result }));
            setActiveStepIndex(0);
          }
        }
      );
      return;
    }

    let cancelled = false;
    const keys = Object.keys(ROUTE_PROFILES) as RouteKey[];
    Promise.all(
      keys.map(
        (key) =>
          new Promise<[RouteKey, google.maps.DirectionsResult | null]>((resolve) => {
            const profile = ROUTE_PROFILES[key];
            directionsService.route(
              {
                origin,
                destination,
                travelMode: google.maps.TravelMode.DRIVING,
                avoidHighways: profile.avoidHighways,
                avoidTolls: profile.avoidTolls,
              },
              (result, status) => resolve([key, status === "OK" ? result : null])
            );
          })
      )
    ).then((results) => {
      if (cancelled) return;
      const next = { best: null, fast: null, comfort: null } as Record<
        RouteKey,
        google.maps.DirectionsResult | null
      >;
      for (const [key, result] of results) next[key] = result;
      setRouteOptions(next);
      const chosen = next[selectedRouteKey] ?? next.best ?? next.fast ?? next.comfort;
      if (chosen) {
        setDirections(chosen);
        setActiveStepIndex(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [routeOrigin?.lat, routeOrigin?.lng, location?.lat, location?.lng, destination, navigating]);

  // Switching which route card is selected (before navigation starts) just swaps in the
  // already-fetched route — no need to hit the Directions API again.
  useEffect(() => {
    if (navigating) return;
    const chosen = routeOptions[selectedRouteKey];
    if (chosen) {
      setDirections(chosen);
      setActiveStepIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteKey]);

  // Live tracking while navigating: advance to the next step as you approach it, rotate
  // the map to face your direction of travel, and trigger a re-route if you've drifted
  // far enough from where the current route was computed.
  useEffect(() => {
    if (!navigating || !location || !directions) return;

    const last = lastLocationRef.current;
    if (last) {
      const movedKm = distanceKm(last.lat, last.lng, location.lat, location.lng);
      if (movedKm > 0.003) {
        setHeading(bearingDegrees(last.lat, last.lng, location.lat, location.lng));
      }
    }
    lastLocationRef.current = location;

    const steps = directions.routes[0]?.legs[0]?.steps ?? [];
    const currentStep = steps[activeStepIndex];
    if (currentStep) {
      const stepEnd = currentStep.end_location;
      const distToStepEndKm = distanceKm(location.lat, location.lng, stepEnd.lat(), stepEnd.lng());
      setDistanceToManeuverM(Math.round(distToStepEndKm * 1000));
      if (distToStepEndKm < 0.03 && activeStepIndex < steps.length - 1) {
        setActiveStepIndex((i) => i + 1);
      }
    }

    if (!routeOrigin || distanceKm(routeOrigin.lat, routeOrigin.lng, location.lat, location.lng) > REROUTE_THRESHOLD_KM) {
      setRouteOrigin(location);
    }

    if (navViewMode === "follow") {
      mapRef.current?.panTo(location);
    }
  }, [location?.lat, location?.lng, navigating, navViewMode]);

  // Switch between the tilted "follow" driving view and the flat "overview" of the
  // whole route whenever the toggle changes (or a fresh route comes in while already
  // in overview mode). "street" mode swaps in a full-screen Street View overlay instead
  // (see the StreetViewNav render below) and doesn't move the map camera underneath it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigating) return;

    if (navViewMode === "follow") {
      map.setTilt(67.5);
      map.setZoom(18);
      if (location) map.panTo(location);
    } else if (navViewMode === "overview") {
      map.setTilt(0);
      map.setHeading(0);
      const bounds = directions?.routes[0]?.bounds;
      if (bounds) map.fitBounds(bounds, 80);
    }
  }, [navViewMode, navigating, directions]);

  const onStreetViewNoCoverage = useCallback(() => {
    setStreetViewUnavailable(true);
    setNavViewMode("follow");
  }, []);

  useEffect(() => {
    if (!streetViewUnavailable) return;
    const timer = setTimeout(() => setStreetViewUnavailable(false), 4000);
    return () => clearTimeout(timer);
  }, [streetViewUnavailable]);

  // Look up the real max zoom Google has imagery for at this location (varies by area —
  // dense cities go much deeper than rural roads), so the "view in 3D?" prompt triggers
  // at an actually-meaningful "you've zoomed in as far as this place goes" point instead
  // of a guessed constant.
  useEffect(() => {
    if (!location || !isLoaded) return;
    const maxZoomService = new google.maps.MaxZoomService();
    maxZoomService.getMaxZoomAtLatLng(location, (result) => {
      if (result.status === "OK") setMaxZoomHere(result.zoom);
    });
  }, [location?.lat, location?.lng, isLoaded]);

  const onZoomChanged = useCallback(() => {
    const map = mapRef.current;
    if (!map || maxZoomHere === null) return;
    const zoom = map.getZoom();
    if (zoom === undefined) return;

    if (zoom >= maxZoomHere) {
      if (!promptedAtMaxZoomRef.current && !street3DMode) {
        promptedAtMaxZoomRef.current = true;
        setShow3DPrompt(true);
      }
    } else {
      promptedAtMaxZoomRef.current = false;
    }
  }, [maxZoomHere, street3DMode]);

  const enterStreet3D = useCallback(() => {
    setShow3DPrompt(false);
    setStreet3DMode(true);
    mapRef.current?.setTilt(67.5);
  }, []);

  const declineStreet3D = useCallback(() => {
    setShow3DPrompt(false);
  }, []);

  const exitStreet3D = useCallback(() => {
    setStreet3DMode(false);
    mapRef.current?.setTilt(0);
    mapRef.current?.setHeading(0);
  }, []);

  const onPlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (loc) setDestination({ lat: loc.lat(), lng: loc.lng() });
  }, []);

  const startPlacement = useCallback(
    (type: AlertType) => {
      setPendingType(type);
      setPendingLocation(location ?? mapRef.current?.getCenter()?.toJSON() ?? DEFAULT_CENTER);
      setReportOpen(false);
    },
    [location]
  );

  const confirmPlacement = useCallback(async () => {
    if (!pendingType || !pendingLocation) return;
    if (!user) {
      alert("Not signed in yet — check the banner at the top of the page.");
      return;
    }
    await reportAlert(pendingType, pendingLocation, user.uid);
    setPendingType(null);
    setPendingLocation(null);
  }, [pendingType, pendingLocation, user]);

  const cancelPlacement = useCallback(() => {
    setPendingType(null);
    setPendingLocation(null);
  }, []);

  const onDeleteAlert = useCallback(async (alert: AlertDoc) => {
    await deleteAlert(alert.id);
    setSelectedAlert(null);
  }, []);

  const onHideAlert = useCallback(
    async (alert: AlertDoc) => {
      if (!user) return;
      await hideAlertForUser(alert.id, user.uid);
      setSelectedAlert(null);
    },
    [user]
  );

  const onConfirmStillHere = useCallback(async (alert: AlertDoc) => {
    await confirmAlert(alert.id);
  }, []);

  const startNavigation = useCallback(() => {
    setNavigating(true);
    setNavViewMode("follow");
    setActiveStepIndex(0);
    setRouteOrigin(location);
    lastLocationRef.current = location;
    mapRef.current?.setTilt(67.5);
    mapRef.current?.setZoom(18);
  }, [location]);

  const endNavigation = useCallback(() => {
    setNavigating(false);
    setHeading(0);
    mapRef.current?.setTilt(0);
    mapRef.current?.setHeading(0);
    mapRef.current?.setZoom(15);
  }, []);

  const clearRoute = useCallback(() => {
    setDestination(null);
    setDirections(null);
    setRouteOptions({ best: null, fast: null, comfort: null });
    setSelectedRouteKey("best");
    setRouteOrigin(null);
    if (navigating) endNavigation();
  }, [navigating, endNavigation]);

  const recenter = useCallback(() => {
    if (!location) return;
    mapRef.current?.panTo(location);
    if (!navigating) mapRef.current?.setZoom(15);
  }, [location, navigating]);

  const center = useMemo(() => location ?? DEFAULT_CENTER, [location]);

  if (!isLoaded) {
    return <div className="loading-screen">Loading map…</div>;
  }

  const statusMessage = authError ?? locationError ?? null;
  const navSteps = directions?.routes[0]?.legs[0]?.steps ?? [];
  const navLeg = directions?.routes[0]?.legs[0];

  return (
    <div className="app-root">
      {statusMessage && <div className="status-banner">{statusMessage}</div>}

      <GoogleMap
        onLoad={(map) => {
          mapRef.current = map;
        }}
        center={center}
        zoom={location ? 15 : 11}
        heading={navigating && navViewMode === "follow" ? heading : 0}
        tilt={(navigating && navViewMode === "follow") || street3DMode ? 67.5 : 0}
        mapContainerClassName="map-container"
        onZoomChanged={onZoomChanged}
        options={{
          disableDefaultUI: true,
          zoomControl: !navigating,
          clickableIcons: false,
          // A vector-rendered Map ID is required for tilt/heading (the "3D follow" driving
          // view) to actually render — without one, Google Maps silently ignores tilt on
          // regular roadmap tiles. Create one at console.cloud.google.com/google/maps-apis/studio/maps
          // (render type: Vector) and set VITE_GOOGLE_MAPS_MAP_ID; falls back to a flat
          // map if unset.
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined,
        }}
        onClick={(e) => {
          if (pendingType && e.latLng) {
            setPendingLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        }}
      >
        {location && (
          <Marker
            position={location}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: "#2563EB",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3,
              scale: 8,
            }}
          />
        )}

        {alerts.map((alert) => (
          <Marker
            key={alert.id}
            position={{ lat: alert.lat, lng: alert.lng }}
            icon={markerIcon(ALERT_COLORS[alert.type])}
            label={{ text: ALERT_EMOJI[alert.type], fontSize: "14px" }}
            onClick={() => setSelectedAlert(alert)}
          />
        ))}

        {pendingLocation && (
          <Marker
            position={pendingLocation}
            draggable
            onDragEnd={(e) => {
              if (e.latLng) setPendingLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: pendingType ? ALERT_COLORS[pendingType] : "#2563EB",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3,
              scale: 14,
            }}
            zIndex={999}
          />
        )}

        {directions && (
          <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />
        )}
      </GoogleMap>

      {!pendingType && !navigating && (
        <div className="top-bar">
          <Autocomplete
            onLoad={(ac) => (autocompleteRef.current = ac)}
            onPlaceChanged={onPlaceChanged}
          >
            <input className="search-input" placeholder="Search destination" />
          </Autocomplete>
        </div>
      )}

      {!pendingType && !navigating && (
        <div className="radius-control">
          <label>
            Alert radius: {settings.alertRadiusKm} km
            <input
              type="range"
              min={1}
              max={15}
              disabled={settings.regionWide}
              value={settings.alertRadiusKm}
              onChange={(e) => setAlertRadiusKm(Number(e.target.value))}
            />
          </label>
          <label className="radius-checkbox">
            <input
              type="checkbox"
              checked={settings.regionWide}
              onChange={(e) => setRegionWide(e.target.checked)}
            />
            Show all alerts region-wide (e.g. all of Australia)
          </label>
          <label className="radius-checkbox">
            <input
              type="checkbox"
              disabled={settings.regionWide}
              checked={settings.fixedZone}
              onChange={(e) => setFixedZone(e.target.checked)}
            />
            Lock alert zone to current spot
          </label>
        </div>
      )}

      {directions && !navigating && !pendingType && (
        <RouteOptionsCard
          routeOptions={routeOptions}
          selectedRouteKey={selectedRouteKey}
          onSelect={setSelectedRouteKey}
          onStart={startNavigation}
          onClear={clearRoute}
        />
      )}

      {navigating && navViewMode === "street" && location && (
        <StreetViewNav position={location} heading={heading} onNoCoverage={onStreetViewNoCoverage} />
      )}

      {navigating && navLeg && (
        <NavigationCard
          step={navSteps[activeStepIndex] ?? null}
          distanceToManeuverM={distanceToManeuverM}
          etaText={navLeg.duration?.text ?? ""}
          distanceRemainingText={navSteps
            .slice(activeStepIndex)
            .reduce((sum, s) => sum + (s.distance?.value ?? 0), 0) < 1000
            ? `${navSteps.slice(activeStepIndex).reduce((sum, s) => sum + (s.distance?.value ?? 0), 0)} m`
            : `${(navSteps.slice(activeStepIndex).reduce((sum, s) => sum + (s.distance?.value ?? 0), 0) / 1000).toFixed(1)} km`}
          navViewMode={navViewMode}
          onSetNavViewMode={setNavViewMode}
          onClearRoute={clearRoute}
          onExit={endNavigation}
        />
      )}

      {streetViewUnavailable && (
        <div className="status-banner">No street-level imagery here — showing 3D Follow instead.</div>
      )}

      {pendingType && pendingLocation && (
        <PlacementBar type={pendingType} onConfirm={confirmPlacement} onCancel={cancelPlacement} />
      )}

      {!pendingType && !navigating && (
        <>
          <button className="fab" onClick={() => setReportOpen(true)} aria-label="Report an alert">
            +
          </button>

          <button
            className="fab fab-secondary"
            onClick={() => setDetectionOpen(true)}
            aria-label="Live vehicle detection"
          >
            🎥
          </button>

          <button
            className="fab fab-tertiary"
            onClick={recenter}
            disabled={!location}
            aria-label="Recenter on my location"
          >
            ➤
          </button>
        </>
      )}

      {street3DMode && (
        <button className="street3d-exit" onClick={exitStreet3D} aria-label="Exit 3D view">
          ✕ Exit 3D
        </button>
      )}

      {show3DPrompt && (
        <ConfirmPrompt
          message="You've zoomed all the way in — do you want to view 3D?"
          onYes={enterStreet3D}
          onNo={declineStreet3D}
        />
      )}

      {showLeaveZonePrompt && (
        <ConfirmPrompt
          message={`Leaving zone — you've moved past your ${settings.alertRadiusKm} km alert zone limit. Adjust to view all alerts around your current surroundings?`}
          onYes={() => {
            setShowLeaveZonePrompt(false);
            setFixedZone(false);
          }}
          onNo={() => setShowLeaveZonePrompt(false)}
        />
      )}

      {reportOpen && (
        <ReportAlertPanel onPlaceOnMap={startPlacement} onClose={() => setReportOpen(false)} />
      )}

      {detectionOpen && (
        <Suspense fallback={<div className="detection-loading">Loading detection model…</div>}>
          <LiveVehicleDetection onClose={() => setDetectionOpen(false)} />
        </Suspense>
      )}

      {selectedAlert && (
        <AlertDetailPanel
          alert={selectedAlert}
          currentUid={user?.uid ?? null}
          onDelete={onDeleteAlert}
          onHide={onHideAlert}
          onConfirmStillHere={onConfirmStillHere}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
}
