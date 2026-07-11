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
// Lazy-loaded: pulls in TensorFlow.js + COCO-SSD (~2MB), so keep it out of the initial bundle.
const LiveVehicleDetection = lazy(() =>
  import("@/components/LiveVehicleDetection").then((m) => ({ default: m.LiveVehicleDetection }))
);
import { ALERT_COLORS, ALERT_EMOJI, type AlertDoc, type AlertType } from "@/types/alert";
import "./App.css";

const LIBRARIES: "places"[] = ["places"];
const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };

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
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    ensureSignedIn()
      .then(setUser)
      .catch((err) => {
        console.warn("[auth] anonymous sign-in failed", err);
        setAuthError(
          "Couldn't sign in (Firebase Anonymous Authentication may be disabled for this project)."
        );
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

  useEffect(() => {
    if (!location || !destination) {
      setDirections(null);
      return;
    }
    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: location,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === "OK" && result) setDirections(result);
      }
    );
  }, [location?.lat, location?.lng, destination]);

  const onPlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (loc) setDestination({ lat: loc.lat(), lng: loc.lng() });
  }, []);

  const onShareAlert = useCallback(
    async (type: AlertType) => {
      if (!location) {
        alert("Still waiting on your location — allow location access and try again.");
        return;
      }
      if (!user) {
        alert("Not signed in yet — check the banner at the top of the page.");
        return;
      }
      await reportAlert(type, location, user.uid);
      setReportOpen(false);
    },
    [location, user]
  );

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

  const center = useMemo(() => location ?? DEFAULT_CENTER, [location]);

  if (!isLoaded) {
    return <div className="loading-screen">Loading map…</div>;
  }

  const statusMessage = authError ?? locationError ?? null;

  return (
    <div className="app-root">
      {statusMessage && <div className="status-banner">{statusMessage}</div>}

      <GoogleMap
        center={center}
        zoom={location ? 15 : 11}
        mapContainerClassName="map-container"
        options={{ disableDefaultUI: true, zoomControl: true, clickableIcons: false }}
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

        {directions && (
          <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />
        )}
      </GoogleMap>

      <div className="top-bar">
        <Autocomplete
          onLoad={(ac) => (autocompleteRef.current = ac)}
          onPlaceChanged={onPlaceChanged}
        >
          <input className="search-input" placeholder="Search destination" />
        </Autocomplete>
      </div>

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

      {reportOpen && (
        <ReportAlertPanel onShare={onShareAlert} onClose={() => setReportOpen(false)} />
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
