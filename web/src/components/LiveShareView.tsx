import { useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { doc, onSnapshot } from "firebase/firestore";
import { db, ensureSignedIn } from "@/services/firebase";
import "../App.css";
import "./LiveShareView.css";

interface Props {
  shareId: string;
}

interface ShareState {
  lat: number;
  lng: number;
  heading: number | null;
  etaText: string;
  arrivalClockText: string;
  active: boolean;
}

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };

let liveMarkerIconCache: google.maps.Symbol | null = null;
function liveMarkerIcon(): google.maps.Symbol {
  if (!liveMarkerIconCache) {
    liveMarkerIconCache = {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#2563EB",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: 9,
    };
  }
  return liveMarkerIconCache;
}

/**
 * Standalone recipient-facing page for a shared trip link (tracklinemaps.com/live/:shareId,
 * see main.tsx's path check). No app chrome, no sign-in prompt -- ensureSignedIn() runs
 * silently (anonymous auth) purely because the liveShares Firestore rule requires a signed-in
 * reader; the visitor never sees or needs an account. Subscribes live via onSnapshot rather
 * than a one-time fetch so the marker/ETA genuinely keep moving as the sender's own periodic
 * update effect (see MapScreen.tsx's shareEta) writes fresh position. "Trip ended" replaces
 * the live view the moment active flips false (exitNavigation on the sender's side), matching
 * the sender's explicit choice for how long this link should keep working.
 */
export function LiveShareView({ shareId }: Props) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });
  const [state, setState] = useState<ShareState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCenteredRef = useRef(false);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    ensureSignedIn()
      .then(() => {
        if (cancelled) return;
        unsubscribe = onSnapshot(
          doc(db, "liveShares", shareId),
          (snap) => {
            if (!snap.exists()) {
              setNotFound(true);
              return;
            }
            const data = snap.data();
            setState({
              lat: data.lat,
              lng: data.lng,
              heading: data.heading ?? null,
              etaText: data.etaText ?? "",
              arrivalClockText: data.arrivalClockText ?? "",
              active: data.active ?? false,
            });
          },
          (err) => {
            setError(err.message);
          }
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [shareId]);

  useEffect(() => {
    if (!state || !mapRef.current || hasCenteredRef.current) return;
    mapRef.current.panTo({ lat: state.lat, lng: state.lng });
    hasCenteredRef.current = true;
  }, [state]);

  if (error || notFound) {
    return (
      <div className="live-share-status">
        <div className="live-share-status-card">
          <div className="live-share-status-title">Link not available</div>
          <div className="live-share-status-body">
            {error ?? "This share link doesn't exist or has expired."}
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded || !state) {
    return (
      <div className="live-share-status">
        <div className="live-share-status-card">
          <div className="live-share-status-title">Loading live trip&hellip;</div>
        </div>
      </div>
    );
  }

  return (
    <div className="live-share-root">
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        center={{ lat: state.lat, lng: state.lng }}
        zoom={15}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        }}
      >
        <Marker position={{ lat: state.lat, lng: state.lng }} icon={liveMarkerIcon()} />
      </GoogleMap>

      <div className="live-share-card">
        {state.active ? (
          <>
            <div className="live-share-eta">ETA {state.etaText}</div>
            <div className="live-share-arrival">Arriving around {state.arrivalClockText}</div>
            <div className="live-share-live-dot">
              <span className="live-share-dot" /> Live location
            </div>
          </>
        ) : (
          <div className="live-share-ended">Trip ended</div>
        )}
      </div>
    </div>
  );
}
