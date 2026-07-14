import { useEffect, useState } from "react";

export interface LatLng {
  lat: number;
  lng: number;
  // Device/GPS-derived course-over-ground and speed, straight from the Geolocation API --
  // the browser computes these from the GPS chip's own Doppler/course data, which is far
  // more stable than deriving a bearing from two consecutive noisy lat/lng fixes ourselves
  // (see the 3D Follow heading fix in App.tsx). Both are null whenever the device is
  // stationary or the platform can't determine them, per the spec.
  heading: number | null;
  speed: number | null;
}

interface GeolocationState {
  location: LatLng | null;
  error: string | null;
}

export function useGeolocation(): GeolocationState {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("This browser doesn't support geolocation.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        });
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { location, error };
}
