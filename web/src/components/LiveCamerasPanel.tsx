import { useEffect, useMemo, useState } from "react";
import { distanceKm } from "@/utils/geo";
import {
  fetchLiveTrafficCameras,
  refreshLiveCameraImageUrl,
  type LiveTrafficCamera,
} from "@/services/liveTrafficCameras";
import "./LiveCamerasPanel.css";

// TfNSW republishes each camera's frame roughly every 60s -- refreshing more often than that
// would just re-fetch the same still image over and over.
const IMAGE_REFRESH_MS = 60_000;

interface Props {
  location: google.maps.LatLngLiteral | null;
  onClose: () => void;
  onSelectCamera: (camera: LiveTrafficCamera | null) => void;
  selectedCameraId: string | null;
}

export function LiveCamerasPanel({ location, onClose, onSelectCamera, selectedCameraId }: Props) {
  const [cameras, setCameras] = useState<LiveTrafficCamera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLiveTrafficCameras()
      .then((result) => {
        if (!cancelled) setCameras(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!location) return cameras;
    return [...cameras].sort(
      (a, b) =>
        distanceKm(location.lat, location.lng, a.lat, a.lng) -
        distanceKm(location.lat, location.lng, b.lat, b.lng)
    );
  }, [cameras, location]);

  const selected = sorted.find((c) => c.id === selectedCameraId) ?? null;

  return (
    <div className="live-cameras-panel">
      <div className="live-cameras-header">
        <span>Live Traffic Cameras — NSW</span>
        <button className="live-cameras-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="live-cameras-subtitle">
        Real government road cameras, for checking traffic conditions. Images refresh about
        once a minute.
      </div>

      {selected ? (
        <LiveCameraDetail camera={selected} onBack={() => onSelectCamera(null)} />
      ) : (
        <div className="live-cameras-list">
          {loading && <div className="live-cameras-status">Loading cameras…</div>}
          {error && <div className="live-cameras-status">Couldn't load live cameras right now.</div>}
          {!loading &&
            !error &&
            sorted.map((camera) => (
              <button
                key={camera.id}
                className="live-camera-row"
                onClick={() => onSelectCamera(camera)}
              >
                <img
                  src={refreshLiveCameraImageUrl(camera.imageUrl)}
                  alt={camera.title}
                  loading="lazy"
                />
                <div className="live-camera-row-text">
                  <div className="live-camera-row-title">{camera.title}</div>
                  {camera.view && <div className="live-camera-row-view">{camera.view}</div>}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function LiveCameraDetail({ camera, onBack }: { camera: LiveTrafficCamera; onBack: () => void }) {
  const [src, setSrc] = useState(() => refreshLiveCameraImageUrl(camera.imageUrl));

  useEffect(() => {
    setSrc(refreshLiveCameraImageUrl(camera.imageUrl));
    const id = setInterval(() => {
      setSrc(refreshLiveCameraImageUrl(camera.imageUrl));
    }, IMAGE_REFRESH_MS);
    return () => clearInterval(id);
  }, [camera.imageUrl]);

  return (
    <div className="live-camera-detail">
      <button className="live-camera-back" onClick={onBack}>
        ‹ All cameras
      </button>
      <img src={src} alt={camera.title} className="live-camera-detail-image" />
      <div className="live-camera-detail-title">{camera.title}</div>
      {camera.view && <div className="live-camera-detail-view">{camera.view}</div>}
      {camera.direction && (
        <div className="live-camera-detail-direction">Facing {camera.direction}</div>
      )}
    </div>
  );
}
