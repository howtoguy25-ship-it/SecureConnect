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

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
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
