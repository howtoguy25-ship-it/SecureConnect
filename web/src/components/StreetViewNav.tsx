import { useEffect, useRef } from "react";
import "./StreetViewNav.css";

interface Props {
  position: google.maps.LatLngLiteral;
  heading: number;
  onNoCoverage: () => void;
}

/**
 * Real first-person "front view" using Google's actual captured Street View imagery,
 * oriented to face the current direction of travel. This is genuine street-level
 * photography from Google, not a live camera feed — parked cars/traffic in it won't
 * match what's really there right now, only the road/buildings will.
 */
export function StreetViewNav({ position, heading, onNoCoverage }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);

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

  useEffect(() => {
    panoramaRef.current?.setPosition(position);
  }, [position.lat, position.lng]);

  useEffect(() => {
    const panorama = panoramaRef.current;
    if (!panorama) return;
    panorama.setPov({ heading, pitch: panorama.getPov().pitch ?? 0 });
  }, [heading]);

  return <div ref={containerRef} className="street-view-nav" />;
}
