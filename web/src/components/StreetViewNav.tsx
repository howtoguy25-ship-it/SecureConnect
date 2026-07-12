import { useEffect, useRef, useState } from "react";
import "./StreetViewNav.css";

interface Props {
  position: google.maps.LatLngLiteral;
  heading: number;
  destination: google.maps.LatLngLiteral | null;
  onNoCoverage: () => void;
}

/**
 * Real first-person "front view" using Google's actual captured Street View imagery,
 * oriented to face the current direction of travel. This is genuine street-level
 * photography from Google, not a live camera feed — parked cars/traffic in it won't
 * match what's really there right now, only the road/buildings will.
 *
 * Two views live here: "Live" tracks the driver's current position/heading as they drive.
 * "Destination" is a static preview of the arrival point, the same imagery Street View
 * would show someone standing there — lets a driver see what they're heading toward without
 * leaving navigation.
 */
export function StreetViewNav({ position, heading, destination, onNoCoverage }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [mode, setMode] = useState<"live" | "destination">("live");
  const [destinationUnavailable, setDestinationUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const panorama = new google.maps.StreetViewPanorama(containerRef.current, {
      position,
      pov: { heading, pitch: 0 },
      zoom: 1,
      addressControl: false,
      linksControl: false,
      panControl: false,
      zoomControl: false,
      enableCloseButton: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
    });
    panoramaRef.current = panorama;

    const streetViewService = new google.maps.StreetViewService();
    streetViewService.getPanorama({ location: position, radius: 50 }, (_data, status) => {
      if (status !== google.maps.StreetViewStatus.OK) onNoCoverage();
    });

    return () => {
      panoramaRef.current = null;
    };
    // Only set up the panorama once on mount — position/heading updates below move the
    // existing panorama instead of tearing it down and recreating it every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live position/heading updates only apply while showing the "live" view -- while showing
  // the destination preview, the panorama should stay put at the destination instead of
  // snapping back to the driver's moving position every GPS tick.
  useEffect(() => {
    if (mode !== "live") return;
    panoramaRef.current?.setPosition(position);
  }, [position.lat, position.lng, mode]);

  useEffect(() => {
    if (mode !== "live") return;
    const panorama = panoramaRef.current;
    if (!panorama) return;
    panorama.setPov({ heading, pitch: panorama.getPov().pitch ?? 0 });
  }, [heading, mode]);

  function showDestination() {
    const panorama = panoramaRef.current;
    if (!panorama || !destination) return;
    const streetViewService = new google.maps.StreetViewService();
    streetViewService.getPanorama({ location: destination, radius: 50 }, (_data, status) => {
      if (status !== google.maps.StreetViewStatus.OK) {
        setDestinationUnavailable(true);
        return;
      }
      setDestinationUnavailable(false);
      panorama.setPosition(destination);
      panorama.setPov({ heading: 0, pitch: 0 });
      setMode("destination");
    });
  }

  useEffect(() => {
    if (!destinationUnavailable) return;
    const timer = setTimeout(() => setDestinationUnavailable(false), 4000);
    return () => clearTimeout(timer);
  }, [destinationUnavailable]);

  function showLive() {
    setMode("live");
    panoramaRef.current?.setPosition(position);
    panoramaRef.current?.setPov({ heading, pitch: 0 });
  }

  return (
    <div className="street-view-nav-wrap">
      <div ref={containerRef} className="street-view-nav" />
      {destination && (
        <div className="street-view-mode-toggle">
          <button className={mode === "live" ? "street-view-mode-active" : ""} onClick={showLive}>
            Live
          </button>
          <button className={mode === "destination" ? "street-view-mode-active" : ""} onClick={showDestination}>
            Destination
          </button>
        </div>
      )}
      {mode === "destination" && (
        <button className="street-view-exit-destination" onClick={showLive}>
          ✕ Exit destination view
        </button>
      )}
      {destinationUnavailable && (
        <div className="street-view-no-destination">No street imagery at the destination.</div>
      )}
    </div>
  );
}
