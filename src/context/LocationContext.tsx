import React, { createContext, useContext, useEffect, useState } from "react";
import * as Location from "expo-location";

interface LocationContextValue {
  location: Location.LocationObject | null;
  errorMsg: string | null;
  permissionGranted: boolean;
}

const LocationContext = createContext<LocationContextValue>({
  location: null,
  errorMsg: null,
  permissionGranted: false,
});

// DIAGNOSTIC BUILD -- Sentry native, the entire ad SDK, and AsyncStorage (Firebase persistence
// + Settings load) are now ALL conclusively ruled out (build 26: everything from all three off
// simultaneously, identical crash persisted). This isolates the next unconditional-on-launch
// native surface: expo-location's requestForegroundPermissionsAsync/watchPositionAsync, run
// together with MapScreen's DIAGNOSTIC_DISABLE_MAPVIEW (see MapScreen.tsx) so this build tests
// both remaining candidates -- location and the native MapView itself -- at once, the same
// combined-isolation approach build 25 used for Sentry+ads.
const DIAGNOSTIC_DISABLE_LOCATION_WATCH = true;

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    if (DIAGNOSTIC_DISABLE_LOCATION_WATCH) return;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Location permission is required for navigation and nearby alerts.");
        return;
      }
      setPermissionGranted(true);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => setLocation(loc)
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  return (
    <LocationContext.Provider value={{ location, errorMsg, permissionGranted }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationContextValue {
  return useContext(LocationContext);
}
