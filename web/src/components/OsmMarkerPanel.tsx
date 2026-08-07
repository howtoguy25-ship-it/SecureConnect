import { useCallback, useEffect, useState } from "react";
import "./OsmMarkerPanel.css";

export type OsmMarkerKind = "traffic_light" | "speed_camera";

interface Props {
  kind: OsmMarkerKind;
  location: google.maps.LatLngLiteral;
  onClose: () => void;
}

const LABELS: Record<OsmMarkerKind, string> = {
  traffic_light: "Traffic light",
  speed_camera: "Speed camera",
};

const ICONS: Record<OsmMarkerKind, string> = {
  traffic_light: "🚦",
  speed_camera: "📷",
};

// Mirrors mobile's OsmMarkerSheet.tsx exactly -- see its own header comment for the full
// reasoning. There's no per-camera/per-light photo dataset, only an OSM coordinate; a real
// Google Street View Static image *at that exact coordinate* is the closest genuinely real
// answer to "show me where this is." The single panorama at a given point is sometimes
// obstructed (a truck/bus parked in front of the lens when it was captured) -- "Try another
// angle" first re-crops the same panorama from a different heading, then falls back to probing
// the (free, imageless) Street View Metadata API at a few nearby offsets for a genuinely
// different capture.
const NEARBY_OFFSET_DEG = 0.00035; // ~35-40m -- close enough to still be "this spot"
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

export function OsmMarkerPanel({ kind, location, onClose }: Props) {
  const [altLocation, setAltLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [headingIndex, setHeadingIndex] = useState(0); // 0 = default heading, 1-4 = 0/90/180/270
  const [findingAngle, setFindingAngle] = useState(false);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");

  // Fresh marker tapped -- drop any angle/nearby-pano search from the previous one.
  useEffect(() => {
    setAltLocation(null);
    setHeadingIndex(0);
  }, [location.lat, location.lng]);

  const baseLocation = altLocation ?? location;
  const headingParam = headingIndex > 0 ? `&heading=${(headingIndex - 1) * 90}` : "";
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${baseLocation.lat},${baseLocation.lng}&fov=80${headingParam}&key=${GOOGLE_MAPS_API_KEY}`;

  useEffect(() => {
    setImageStatus("loading");
  }, [streetViewUrl]);

  const fetchPanoId = useCallback(async (loc: google.maps.LatLngLiteral): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc.lat},${loc.lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await res.json();
      return json.status === "OK" && json.pano_id ? String(json.pano_id) : null;
    } catch {
      return null;
    }
  }, []);

  const tryAnotherAngle = useCallback(async () => {
    if (findingAngle) return;
    setFindingAngle(true);
    try {
      const currentPanoId = await fetchPanoId(baseLocation);
      const offsets: google.maps.LatLngLiteral[] = [
        { lat: location.lat + NEARBY_OFFSET_DEG, lng: location.lng },
        { lat: location.lat - NEARBY_OFFSET_DEG, lng: location.lng },
        { lat: location.lat, lng: location.lng + NEARBY_OFFSET_DEG },
        { lat: location.lat, lng: location.lng - NEARBY_OFFSET_DEG },
      ];
      for (const candidate of offsets) {
        const candidatePanoId = await fetchPanoId(candidate);
        if (candidatePanoId && candidatePanoId !== currentPanoId) {
          setAltLocation(candidate);
          setHeadingIndex(0);
          return;
        }
      }
      // No distinct nearby capture found -- fall back to a different crop angle of the same
      // panorama. Still a real, different photo whenever the obstruction didn't wrap the whole
      // horizon.
      setHeadingIndex((i) => (i + 1) % 5);
    } finally {
      setFindingAngle(false);
    }
  }, [location, baseLocation, findingAngle, fetchPanoId]);

  return (
    <div className="osm-marker-panel">
      <button className="osm-marker-panel-close-x" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className="osm-marker-panel-title">
        {ICONS[kind]} {LABELS[kind]}
      </div>
      <div className="osm-marker-panel-coords">
        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </div>
      <div className="osm-marker-panel-image-wrap">
        <img
          src={streetViewUrl}
          alt={LABELS[kind]}
          className="osm-marker-panel-image"
          onLoad={() => setImageStatus("loaded")}
          onError={() => setImageStatus("error")}
        />
        {imageStatus === "loading" && (
          <div className="osm-marker-panel-image-overlay">Loading…</div>
        )}
        {imageStatus === "error" && (
          <div className="osm-marker-panel-image-overlay">
            Street View image unavailable right now
          </div>
        )}
        {imageStatus === "loaded" && (
          <button
            className="osm-marker-panel-angle-button"
            onClick={tryAnotherAngle}
            disabled={findingAngle}
            aria-label="Try another angle if this image is blocked"
          >
            {findingAngle ? "…" : "↻"}
          </button>
        )}
      </div>
      <div className="osm-marker-panel-caption">
        Real Google Street View imagery of this spot — location from OpenStreetMap community
        data. If the shot is blocked (e.g. by a passing truck), tap ↻ on the photo to try a
        different real angle or a nearby capture.
      </div>
    </div>
  );
}
