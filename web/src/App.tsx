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
import { subscribeNearbyAlerts, reportAlert, deleteAlert, hideAlertForUser, confirmAlert } from "@/services/alerts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSettings } from "@/hooks/useSettings";
import { ReportAlertPanel } from "@/components/ReportAlertPanel";
import { AlertDetailPanel } from "@/components/AlertDetailPanel";
import { PlacementBar } from "@/components/PlacementBar";
import { NavigationCard } from "@/components/NavigationCard";
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
  const { settings, setAlertRadiusKm } = useSettings();
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AlertDoc[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDoc | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [detectionOpen, setDetectionOpen] = useState(false);

  const [destination, setDestination] = useState<google.maps.LatLngLiteral | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
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
  const lastLocationRef = useRef<google.maps.LatLngLiteral | null>(null);

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
    if (!location || !user) return;
    const unsubscribe = subscribeNearbyAlerts(
      location.lat,
      location.lng,
      settings.alertRadiusKm,
      user.uid,
      setAlerts
    );
    return unsubscribe;
  }, [location?.lat, location?.lng, settings.alertRadiusKm, user?.uid]);

  // Compute/refresh directions. While navigating, this also acts as live re-routing: it
  // re-fires whenever routeOrigin moves (see the drift-triggered update further down).
  useEffect(() => {
    const origin = routeOrigin ?? location;
    if (!origin || !destination) {
      setDirections(null);
      return;
    }
    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) {
          setDirections(result);
          setActiveStepIndex(0);
        }
      }
    );
  }, [routeOrigin?.lat, routeOrigin?.lng, location?.lat, location?.lng, destination]);

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
      if (distToStepEndKm < 0.03 && activeStepIndex < steps.length - 1) {
        setActiveStepIndex((i) => i + 1);
      }
    }

    if (!routeOrigin || distanceKm(routeOrigin.lat, routeOrigin.lng, location.lat, location.lng) > REROUTE_THRESHOLD_KM) {
      setRouteOrigin(location);
    }

    mapRef.current?.panTo(location);
  }, [location?.lat, location?.lng, navigating]);

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
    setActiveStepIndex(0);
    setRouteOrigin(location);
    lastLocationRef.current = location;
    mapRef.current?.setTilt(45);
    mapRef.current?.setZoom(18);
  }, [location]);

  const endNavigation = useCallback(() => {
    setNavigating(false);
    setHeading(0);
    mapRef.current?.setTilt(0);
    mapRef.current?.setHeading(0);
    mapRef.current?.setZoom(15);
  }, []);

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
        heading={navigating ? heading : 0}
        tilt={navigating ? 45 : 0}
        mapContainerClassName="map-container"
        options={{ disableDefaultUI: true, zoomControl: !navigating, clickableIcons: false }}
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
              value={settings.alertRadiusKm}
              onChange={(e) => setAlertRadiusKm(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {directions && !navigating && !pendingType && (
        <button className="start-nav-button" onClick={startNavigation}>
          Start navigation · ETA {navLeg?.duration?.text}
        </button>
      )}

      {navigating && navLeg && (
        <NavigationCard
          step={navSteps[activeStepIndex] ?? null}
          etaText={navLeg.duration?.text ?? ""}
          distanceRemainingText={navSteps
            .slice(activeStepIndex)
            .reduce((sum, s) => sum + (s.distance?.value ?? 0), 0) < 1000
            ? `${navSteps.slice(activeStepIndex).reduce((sum, s) => sum + (s.distance?.value ?? 0), 0)} m`
            : `${(navSteps.slice(activeStepIndex).reduce((sum, s) => sum + (s.distance?.value ?? 0), 0) / 1000).toFixed(1)} km`}
          onExit={endNavigation}
        />
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
        </>
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
