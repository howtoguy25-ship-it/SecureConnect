import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Autocomplete,
  DirectionsRenderer,
} from "@react-google-maps/api";
import type { User } from "firebase/auth";
import { ensureSignedIn, signInWithGoogle, signInWithApple, signOutUser } from "@/services/firebase";
import { upsertSignedInProfile } from "@/services/userProfile";
import {
  subscribeNearbyAlerts,
  subscribeAllAlerts,
  reportAlert,
  deleteAlert,
  hideAlertForUser,
  confirmAlert,
} from "@/services/alerts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useSettings } from "@/hooks/useSettings";
import { ReportAlertPanel } from "@/components/ReportAlertPanel";
import { AlertDetailPanel } from "@/components/AlertDetailPanel";
import { PlacementBar } from "@/components/PlacementBar";
import { NavigationCard, type NavViewMode } from "@/components/NavigationCard";
import { RouteOptionsCard } from "@/components/RouteOptionsCard";
import { StreetViewNav } from "@/components/StreetViewNav";
import { ConfirmPrompt } from "@/components/ConfirmPrompt";
import { AboutPanel } from "@/components/AboutPanel";
import { AdminPanel } from "@/components/AdminPanel";
import { BusinessDetailPanel } from "@/components/BusinessDetailPanel";
import { Street3DJoystick } from "@/components/Street3DJoystick";
import { ROUTE_PROFILES, type RouteKey } from "@/utils/routeProfiles";
// Lazy-loaded: pulls in TensorFlow.js + COCO-SSD (~2MB), so keep it out of the initial bundle.
const LiveVehicleDetection = lazy(() =>
  import("@/components/LiveVehicleDetection").then((m) => ({ default: m.LiveVehicleDetection }))
);
import { ALERT_COLORS, ALERT_EMOJI, type AlertDoc, type AlertType } from "@/types/alert";
import { bearingDegrees, distanceKm } from "@/utils/geo";
import { stripHtml, formatArrivalClock } from "@/utils/navFormat";
import { DARK_MAP_STYLE } from "@/utils/mapStyles";
import type { DetectionNavContext } from "@/components/LiveVehicleDetection";
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
  const { settings, setAlertRadiusKm, setRegionWide, setFixedZone, setHideDetectionTrace, setTheme } =
    useSettings();
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AlertDoc[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDoc | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [detectionOpen, setDetectionOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  // Business/POI detail panel (hours, rating, reviews) -- fetched via Places whenever a
  // clickable map icon is tapped outside of any placement/zoom mode.
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [placeDetails, setPlaceDetails] = useState<google.maps.places.PlaceResult | null>(null);

  const [destination, setDestination] = useState<google.maps.LatLngLiteral | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeOptions, setRouteOptions] = useState<Record<RouteKey, google.maps.DirectionsResult | null>>({
    best: null,
    fast: null,
    comfort: null,
  });
  const [selectedRouteKey, setSelectedRouteKey] = useState<RouteKey>("best");
  const [routeOrigin, setRouteOrigin] = useState<google.maps.LatLngLiteral | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  // Manual alert placement: pick a type, then tap/drag on the map to choose where the
  // report actually goes, instead of always using your current GPS fix.
  const [pendingType, setPendingType] = useState<AlertType | null>(null);
  const [pendingLocation, setPendingLocation] = useState<google.maps.LatLngLiteral | null>(null);

  // Single-waypoint "Add Stop": tap the map once to insert a stop into the current route.
  const [addingStop, setAddingStop] = useState(false);
  const [stopLocation, setStopLocation] = useState<google.maps.LatLngLiteral | null>(null);

  // Live turn-by-turn navigation
  const [navigating, setNavigating] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [heading, setHeading] = useState(0);
  // "follow" = tilted, rotating, close-up camera that tracks your heading (driving view);
  // "street" = real Google Street View imagery facing your direction of travel (front/driver view);
  // "overview" = flat, north-up, zoomed out to show the entire route start-to-finish.
  const [navViewMode, setNavViewMode] = useState<NavViewMode>("follow");
  const [distanceToManeuverM, setDistanceToManeuverM] = useState<number | null>(null);
  const [streetViewUnavailable, setStreetViewUnavailable] = useState(false);
  const lastLocationRef = useRef<google.maps.LatLngLiteral | null>(null);

  // "View in 3D?" prompt — triggers either by double-clicking the map or by reaching max
  // zoom. Declining arms a one-shot "next single click zooms out" mode instead of making
  // every click zoom out (which would fight with pin/stop placement); double-clicking
  // again always re-asks regardless of that armed state.
  const [maxZoomHere, setMaxZoomHere] = useState<number | null>(null);
  const [show3DPrompt, setShow3DPrompt] = useState(false);
  const [street3DMode, setStreet3DMode] = useState(false);
  const [zoomOutArmed, setZoomOutArmed] = useState(false);
  const promptedAtMaxZoomRef = useRef(false);

  // Fixed alert zone
  const [zoneCenter, setZoneCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [showLeaveZonePrompt, setShowLeaveZonePrompt] = useState(false);
  const leaveZonePromptedRef = useRef(false);

  // Theme: "system" tracks the OS/browser preference live; "light"/"dark" is a saved
  // override. The actual color swap happens via CSS variables keyed off a data-theme
  // attribute on <html> (see App.css) so it applies instantly with no re-render needed.
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (settings.theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", settings.theme);
    }
  }, [settings.theme]);

  const isDarkTheme = settings.theme === "dark" || (settings.theme === "system" && systemPrefersDark);

  useEffect(() => {
    ensureSignedIn()
      .then(setUser)
      .catch((err) => {
        console.warn("[auth] anonymous sign-in failed", err);
        const code = err instanceof Object && "code" in err ? String((err as any).code) : null;
        setAuthError(`Couldn't sign in: ${code ?? (err instanceof Error ? err.message : String(err))}`);
      });
  }, []);

  // Records name/email/provider for the admin panel -- never a password, since Firebase
  // never gives that to the client either way. No-ops for anonymous "Guest" sessions.
  useEffect(() => {
    if (user && !user.isAnonymous) {
      upsertSignedInProfile(user).catch((err) => console.warn("[auth] profile sync failed", err));
    }
  }, [user]);

  const handleSignInGoogle = useCallback(async () => {
    try {
      setUser(await signInWithGoogle());
    } catch (err) {
      console.warn("[auth] Google sign-in failed", err);
      setAuthError(err instanceof Error ? err.message : "Google sign-in failed.");
    }
  }, []);

  const handleSignInApple = useCallback(async () => {
    try {
      setUser(await signInWithApple());
    } catch (err) {
      console.warn("[auth] Apple sign-in failed", err);
      setAuthError(err instanceof Error ? err.message : "Apple sign-in failed.");
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
    try {
      setUser(await ensureSignedIn());
    } catch (err) {
      console.warn("[auth] re-sign-in after sign-out failed", err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    if (settings.regionWide) {
      return subscribeAllAlerts(user.uid, setAlerts);
    }

    const queryCenter = settings.fixedZone ? zoneCenter ?? location : location;
    if (!queryCenter) return;

    return subscribeNearbyAlerts(
      queryCenter.lat,
      queryCenter.lng,
      settings.alertRadiusKm,
      user.uid,
      setAlerts
    );
  }, [
    location?.lat,
    location?.lng,
    settings.alertRadiusKm,
    settings.regionWide,
    settings.fixedZone,
    zoneCenter?.lat,
    zoneCenter?.lng,
    user?.uid,
  ]);

  // Seed the fixed zone's center the moment it's turned on; clear it when turned off so
  // it re-seeds fresh next time instead of reusing a stale spot.
  useEffect(() => {
    if (settings.fixedZone && !zoneCenter && location) {
      setZoneCenter(location);
      leaveZonePromptedRef.current = false;
    }
    if (!settings.fixedZone && zoneCenter) {
      setZoneCenter(null);
      setShowLeaveZonePrompt(false);
    }
  }, [settings.fixedZone, zoneCenter, location]);

  // Watch for drifting outside the fixed zone's radius and prompt once per "leaving" event.
  useEffect(() => {
    if (!settings.fixedZone || !zoneCenter || !location) return;
    const distFromZoneKm = distanceKm(zoneCenter.lat, zoneCenter.lng, location.lat, location.lng);
    if (distFromZoneKm > settings.alertRadiusKm) {
      if (!leaveZonePromptedRef.current) {
        leaveZonePromptedRef.current = true;
        setShowLeaveZonePrompt(true);
      }
    } else {
      leaveZonePromptedRef.current = false;
    }
  }, [location?.lat, location?.lng, settings.fixedZone, settings.alertRadiusKm, zoneCenter]);

  // Compute/refresh directions. Before navigating, this fetches three real, distinctly
  // -constrained routes (Best/Fast/Comfort) so the route picker has real options to show.
  // While navigating, it only re-fetches whichever profile is already selected — live
  // re-routing (see the drift-triggered update further down) shouldn't silently swap the
  // route's character mid-drive, and refetching all three every reroute would be wasteful.
  useEffect(() => {
    const origin = routeOrigin ?? location;
    if (!origin || !destination) {
      setRouteOptions({ best: null, fast: null, comfort: null });
      setDirections(null);
      return;
    }
    const directionsService = new google.maps.DirectionsService();

    const waypoints = stopLocation ? [{ location: stopLocation, stopover: true }] : undefined;

    if (navigating) {
      const profile = ROUTE_PROFILES[selectedRouteKey];
      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: google.maps.TravelMode.DRIVING,
          avoidHighways: profile.avoidHighways,
          avoidTolls: profile.avoidTolls,
        },
        (result, status) => {
          if (status === "OK" && result) {
            setDirections(result);
            setRouteOptions((prev) => ({ ...prev, [selectedRouteKey]: result }));
            setActiveStepIndex(0);
          }
        }
      );
      return;
    }

    let cancelled = false;
    const keys = Object.keys(ROUTE_PROFILES) as RouteKey[];
    Promise.all(
      keys.map(
        (key) =>
          new Promise<[RouteKey, google.maps.DirectionsResult | null]>((resolve) => {
            const profile = ROUTE_PROFILES[key];
            directionsService.route(
              {
                origin,
                destination,
                waypoints,
                travelMode: google.maps.TravelMode.DRIVING,
                avoidHighways: profile.avoidHighways,
                avoidTolls: profile.avoidTolls,
              },
              (result, status) => resolve([key, status === "OK" ? result : null])
            );
          })
      )
    ).then((results) => {
      if (cancelled) return;
      const next = { best: null, fast: null, comfort: null } as Record<
        RouteKey,
        google.maps.DirectionsResult | null
      >;
      for (const [key, result] of results) next[key] = result;
      setRouteOptions(next);
      const chosen = next[selectedRouteKey] ?? next.best ?? next.fast ?? next.comfort;
      if (chosen) {
        setDirections(chosen);
        setActiveStepIndex(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    routeOrigin?.lat,
    routeOrigin?.lng,
    location?.lat,
    location?.lng,
    destination,
    navigating,
    stopLocation?.lat,
    stopLocation?.lng,
  ]);

  // Switching which route card is selected (before navigation starts) just swaps in the
  // already-fetched route — no need to hit the Directions API again.
  useEffect(() => {
    if (navigating) return;
    const chosen = routeOptions[selectedRouteKey];
    if (chosen) {
      setDirections(chosen);
      setActiveStepIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRouteKey]);

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
      setDistanceToManeuverM(Math.round(distToStepEndKm * 1000));
      if (distToStepEndKm < 0.03 && activeStepIndex < steps.length - 1) {
        setActiveStepIndex((i) => i + 1);
      }
    }

    if (!routeOrigin || distanceKm(routeOrigin.lat, routeOrigin.lng, location.lat, location.lng) > REROUTE_THRESHOLD_KM) {
      setRouteOrigin(location);
    }

    if (navViewMode === "follow") {
      mapRef.current?.panTo(location);
    }
  }, [location?.lat, location?.lng, navigating, navViewMode]);

  // Switch between the tilted "follow" driving view and the flat "overview" of the
  // whole route whenever the toggle changes (or a fresh route comes in while already
  // in overview mode). "street" mode swaps in a full-screen Street View overlay instead
  // (see the StreetViewNav render below) and doesn't move the map camera underneath it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !navigating) return;

    if (navViewMode === "follow") {
      map.setTilt(67.5);
      map.setZoom(18);
      if (location) map.panTo(location);
    } else if (navViewMode === "overview") {
      map.setTilt(0);
      map.setHeading(0);
      const bounds = directions?.routes[0]?.bounds;
      if (bounds) map.fitBounds(bounds, 80);
    }
  }, [navViewMode, navigating, directions]);

  const onStreetViewNoCoverage = useCallback(() => {
    setStreetViewUnavailable(true);
    setNavViewMode("follow");
  }, []);

  useEffect(() => {
    if (!streetViewUnavailable) return;
    const timer = setTimeout(() => setStreetViewUnavailable(false), 4000);
    return () => clearTimeout(timer);
  }, [streetViewUnavailable]);

  // Look up the real max zoom Google has imagery for at this location (varies by area —
  // dense cities go much deeper than rural roads), so the "view in 3D?" prompt triggers
  // at an actually-meaningful "you've zoomed in as far as this place goes" point instead
  // of a guessed constant.
  useEffect(() => {
    if (!location || !isLoaded) return;
    const maxZoomService = new google.maps.MaxZoomService();
    maxZoomService.getMaxZoomAtLatLng(location, (result) => {
      if (result.status === "OK") setMaxZoomHere(result.zoom);
    });
  }, [location?.lat, location?.lng, isLoaded]);

  const onZoomChanged = useCallback(() => {
    const map = mapRef.current;
    if (!map || maxZoomHere === null) return;
    const zoom = map.getZoom();
    if (zoom === undefined) return;

    if (zoom >= maxZoomHere) {
      if (!promptedAtMaxZoomRef.current && !street3DMode) {
        promptedAtMaxZoomRef.current = true;
        setShow3DPrompt(true);
      }
    } else {
      promptedAtMaxZoomRef.current = false;
    }
  }, [maxZoomHere, street3DMode]);

  useEffect(() => {
    if (!selectedPlaceId || !mapRef.current) return;
    const service = new google.maps.places.PlacesService(mapRef.current);
    service.getDetails(
      {
        placeId: selectedPlaceId,
        fields: [
          "name",
          "formatted_address",
          "formatted_phone_number",
          "website",
          "rating",
          "user_ratings_total",
          "opening_hours",
          "reviews",
          "geometry",
        ],
      },
      (result, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && result) {
          setPlaceDetails(result);
        } else {
          setPlaceDetails(null);
          setSelectedPlaceId(null);
        }
      }
    );
  }, [selectedPlaceId]);

  const closeBusinessPanel = useCallback(() => {
    setSelectedPlaceId(null);
    setPlaceDetails(null);
  }, []);

  const getDirectionsToPlace = useCallback(() => {
    const loc = placeDetails?.geometry?.location;
    if (!loc) return;
    setDestination({ lat: loc.lat(), lng: loc.lng() });
    closeBusinessPanel();
  }, [placeDetails, closeBusinessPanel]);

  const enterStreet3D = useCallback(() => {
    setShow3DPrompt(false);
    setZoomOutArmed(false);
    setStreet3DMode(true);
    mapRef.current?.setTilt(67.5);
  }, []);

  const declineStreet3D = useCallback(() => {
    setShow3DPrompt(false);
    setZoomOutArmed(true);
  }, []);

  const exitStreet3D = useCallback(() => {
    setStreet3DMode(false);
    mapRef.current?.setTilt(0);
    mapRef.current?.setHeading(0);
  }, []);

  const onMapDblClick = useCallback(() => {
    setZoomOutArmed(false);
    setShow3DPrompt(true);
  }, []);

  const rotateStreet3D = useCallback((deltaDeg: number) => {
    const map = mapRef.current;
    if (!map) return;
    const current = map.getHeading() ?? 0;
    map.setHeading((current + deltaDeg + 360) % 360);
  }, []);

  const tiltStreet3D = useCallback((deltaDeg: number) => {
    const map = mapRef.current;
    if (!map) return;
    const current = map.getTilt() ?? 0;
    map.setTilt(Math.max(0, Math.min(67.5, current + deltaDeg)));
  }, []);

  const onPlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (loc) setDestination({ lat: loc.lat(), lng: loc.lng() });
  }, []);

  // Biases (doesn't restrict) destination search toward wherever the user actually is, so
  // typing "Lak..." near Lakemba, NSW ranks Lakemba first instead of a same-named place
  // elsewhere in the world -- a real Autocomplete `bounds` soft bias, not a hard filter, so
  // a deliberately-typed far-away destination is still reachable.
  const biasAutocompleteToLocation = useCallback((loc: google.maps.LatLngLiteral) => {
    if (!autocompleteRef.current) return;
    const circle = new google.maps.Circle({ center: loc, radius: 50000 });
    const bounds = circle.getBounds();
    if (bounds) autocompleteRef.current.setBounds(bounds);
  }, []);

  useEffect(() => {
    if (location) biasAutocompleteToLocation(location);
  }, [location?.lat, location?.lng, biasAutocompleteToLocation]);

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
    setNavViewMode("follow");
    setActiveStepIndex(0);
    setRouteOrigin(location);
    lastLocationRef.current = location;
    mapRef.current?.setTilt(67.5);
    mapRef.current?.setZoom(18);
  }, [location]);

  const endNavigation = useCallback(() => {
    setNavigating(false);
    setHeading(0);
    mapRef.current?.setTilt(0);
    mapRef.current?.setHeading(0);
    mapRef.current?.setZoom(15);
  }, []);

  const clearRoute = useCallback(() => {
    setDestination(null);
    setDirections(null);
    setRouteOptions({ best: null, fast: null, comfort: null });
    setSelectedRouteKey("best");
    setRouteOrigin(null);
    setStopLocation(null);
    setAddingStop(false);
    if (navigating) endNavigation();
  }, [navigating, endNavigation]);

  const onAddStopClick = useCallback(() => {
    setDetectionOpen(false);
    if (stopLocation) {
      setStopLocation(null);
    } else {
      setAddingStop(true);
    }
  }, [stopLocation]);

  const onReportClick = useCallback(() => {
    setDetectionOpen(false);
    setReportOpen(true);
  }, []);

  // One-time snapshot share (Web Share API, or copy to clipboard as a fallback) -- not a
  // live-updating tracking link, since that would need a backend to serve a page that keeps
  // refreshing your position, which isn't wired up here.
  const shareEta = useCallback(() => {
    const leg = directions?.routes[0]?.legs[0];
    if (!leg || !location) return;
    const arrivalText = formatArrivalClock(Date.now() + (leg.duration?.value ?? 0) * 1000);
    const mapsLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    const text = `I'm on my way — ETA ${leg.duration?.text ?? ""}, arriving around ${arrivalText}. My current location: ${mapsLink}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        alert("Copied your ETA and current location to the clipboard — paste it to send.");
      });
    }
  }, [directions, location]);

  const recenter = useCallback(() => {
    if (!location) return;
    mapRef.current?.panTo(location);
    if (!navigating) mapRef.current?.setZoom(15);
  }, [location, navigating]);

  const center = useMemo(() => location ?? DEFAULT_CENTER, [location]);

  if (!isLoaded) {
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="TrackLive" className="loading-logo" />
        Loading map…
      </div>
    );
  }

  const statusMessage = authError ?? locationError ?? null;
  const navSteps = directions?.routes[0]?.legs[0]?.steps ?? [];
  const navLeg = directions?.routes[0]?.legs[0];
  const currentStep = navSteps[activeStepIndex] ?? null;

  const remainingMeters = navSteps
    .slice(activeStepIndex)
    .reduce((sum, s) => sum + (s.distance?.value ?? 0), 0);
  const distanceRemainingText =
    remainingMeters < 1000 ? `${remainingMeters} m` : `${(remainingMeters / 1000).toFixed(1)} km`;

  const bearingToManeuverDeg =
    currentStep && location
      ? bearingDegrees(location.lat, location.lng, currentStep.end_location.lat(), currentStep.end_location.lng())
      : null;

  const detectionNavContext: DetectionNavContext | null =
    navigating && navLeg
      ? {
          instructionText: currentStep ? stripHtml(currentStep.instructions) : "Recalculating…",
          distanceToManeuverM,
          etaText: navLeg.duration?.text ?? "",
          arrivalClockText: formatArrivalClock(Date.now() + (navLeg.duration?.value ?? 0) * 1000),
          distanceRemainingText,
          bearingToManeuverDeg,
          travelHeadingDeg: heading,
          hideTrace: settings.hideDetectionTrace,
          hasStop: !!stopLocation,
          onAddStop: onAddStopClick,
          onShareEta: shareEta,
          onReportAlert: onReportClick,
        }
      : null;

  return (
    <div className="app-root">
      {statusMessage && <div className="status-banner">{statusMessage}</div>}

      <GoogleMap
        onLoad={(map) => {
          mapRef.current = map;
        }}
        center={center}
        zoom={location ? 15 : 11}
        heading={navigating && navViewMode === "follow" ? heading : 0}
        tilt={(navigating && navViewMode === "follow") || street3DMode ? 67.5 : 0}
        mapContainerClassName="map-container"
        onZoomChanged={onZoomChanged}
        onDblClick={onMapDblClick}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          // Double-click is repurposed below to open the "view in 3D?" prompt instead of
          // Google's default double-click-to-zoom-in.
          disableDoubleClickZoom: true,
          // Enables tapping businesses/POIs for the details panel (hours/rating/reviews) --
          // see the onClick handler below, which still lets placement/zoom modes take
          // priority over a POI tap.
          clickableIcons: true,
          // A vector-rendered Map ID is required for tilt/heading (the "3D follow" driving
          // view) to actually render — without one, Google Maps silently ignores tilt on
          // regular roadmap tiles. Create one at console.cloud.google.com/google/maps-apis/studio/maps
          // (render type: Vector) and set VITE_GOOGLE_MAPS_MAP_ID; falls back to a flat
          // map if unset.
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined,
          // Inline styles are ignored on Map ID-based vector maps (Google requires a
          // separately-configured dark Map ID for that case instead) -- only apply the
          // dark tile style here when there's no Map ID to conflict with.
          styles: isDarkTheme && !import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ? DARK_MAP_STYLE : undefined,
        }}
        onClick={(e) => {
          const placeEvent = e as google.maps.MapMouseEvent & { placeId?: string };
          if (pendingType && e.latLng) {
            setPendingLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          } else if (addingStop && e.latLng) {
            setStopLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            setAddingStop(false);
          } else if (zoomOutArmed) {
            const map = mapRef.current;
            const currentZoom = map?.getZoom() ?? 15;
            map?.setZoom(Math.max(3, currentZoom - 4));
            setZoomOutArmed(false);
          } else if (placeEvent.placeId) {
            placeEvent.stop();
            setSelectedPlaceId(placeEvent.placeId);
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

        {stopLocation && (
          <Marker
            position={stopLocation}
            onClick={() => setStopLocation(null)}
            title="Stop (click to remove)"
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: "#F59E0B",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 3,
              scale: 10,
            }}
            zIndex={998}
          />
        )}

        {directions && (
          <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />
        )}
      </GoogleMap>

      {!pendingType && !navigating && (
        <button className="about-button" onClick={() => setAboutOpen(true)} aria-label="About TrackLive">
          <img src="/logo.png" alt="" />
        </button>
      )}

      {!pendingType && !navigating && (
        <div className="top-bar">
          <Autocomplete
            onLoad={(ac) => {
              autocompleteRef.current = ac;
              if (location) biasAutocompleteToLocation(location);
            }}
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
              disabled={settings.regionWide}
              value={settings.alertRadiusKm}
              onChange={(e) => setAlertRadiusKm(Number(e.target.value))}
            />
          </label>
          <label className="radius-checkbox">
            <input
              type="checkbox"
              checked={settings.regionWide}
              onChange={(e) => setRegionWide(e.target.checked)}
            />
            Show all alerts region-wide (e.g. all of Australia)
          </label>
          <label className="radius-checkbox">
            <input
              type="checkbox"
              disabled={settings.regionWide}
              checked={settings.fixedZone}
              onChange={(e) => setFixedZone(e.target.checked)}
            />
            Lock alert zone to current spot
          </label>
        </div>
      )}

      {directions && !navigating && !pendingType && (
        <RouteOptionsCard
          routeOptions={routeOptions}
          selectedRouteKey={selectedRouteKey}
          onSelect={setSelectedRouteKey}
          onStart={startNavigation}
          onClear={clearRoute}
        />
      )}

      {navigating && navViewMode === "street" && location && (
        <StreetViewNav position={location} heading={heading} onNoCoverage={onStreetViewNoCoverage} />
      )}

      {navigating && navLeg && (
        <NavigationCard
          step={navSteps[activeStepIndex] ?? null}
          distanceToManeuverM={distanceToManeuverM}
          etaText={navLeg.duration?.text ?? ""}
          distanceRemainingText={distanceRemainingText}
          navViewMode={navViewMode}
          onSetNavViewMode={setNavViewMode}
          onClearRoute={clearRoute}
          onExit={endNavigation}
          hasStop={!!stopLocation}
          onAddStop={onAddStopClick}
          onShareEta={shareEta}
          onReportAlert={onReportClick}
          onOpenDetection={() => setDetectionOpen(true)}
        />
      )}

      {streetViewUnavailable && (
        <div className="status-banner">No street-level imagery here — showing 3D Follow instead.</div>
      )}

      {pendingType && pendingLocation && (
        <PlacementBar type={pendingType} onConfirm={confirmPlacement} onCancel={cancelPlacement} />
      )}

      {addingStop && (
        <div className="stop-placement-bar">
          <span>Tap the map to add a stop</span>
          <button onClick={() => setAddingStop(false)}>Cancel</button>
        </div>
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

          <button
            className="fab fab-tertiary"
            onClick={recenter}
            disabled={!location}
            aria-label="Recenter on my location"
          >
            ➤
          </button>

          <button
            className={`fab fab-quaternary${settings.hideDetectionTrace ? " fab-toggle-active" : ""}`}
            onClick={() => setHideDetectionTrace(!settings.hideDetectionTrace)}
            aria-label={
              settings.hideDetectionTrace
                ? "AI Detection route guide hidden — tap to show it again"
                : "Hide AI Detection route guide"
            }
            title={settings.hideDetectionTrace ? "Route guide hidden in AI Detection" : "Hide AI Detection route guide"}
          >
            🧭
          </button>
        </>
      )}

      {street3DMode && (
        <>
          <button className="street3d-exit" onClick={exitStreet3D} aria-label="Exit 3D view">
            ✕ Exit 3D
          </button>
          <Street3DJoystick onRotate={rotateStreet3D} onTilt={tiltStreet3D} />
        </>
      )}

      {show3DPrompt && (
        <ConfirmPrompt message="Do you want to view 3D?" onYes={enterStreet3D} onNo={declineStreet3D} />
      )}

      {showLeaveZonePrompt && (
        <ConfirmPrompt
          message={`Leaving zone — you've moved past your ${settings.alertRadiusKm} km alert zone limit. Adjust to view all alerts around your current surroundings?`}
          onYes={() => {
            setShowLeaveZonePrompt(false);
            setFixedZone(false);
          }}
          onNo={() => setShowLeaveZonePrompt(false)}
        />
      )}

      {reportOpen && (
        <ReportAlertPanel onPlaceOnMap={startPlacement} onClose={() => setReportOpen(false)} />
      )}

      {detectionOpen && (
        <Suspense fallback={<div className="detection-loading">Loading detection model…</div>}>
          <LiveVehicleDetection onClose={() => setDetectionOpen(false)} navContext={detectionNavContext} />
        </Suspense>
      )}

      {aboutOpen && (
        <AboutPanel
          theme={settings.theme}
          onSetTheme={setTheme}
          user={user}
          onSignInGoogle={handleSignInGoogle}
          onSignInApple={handleSignInApple}
          onSignOut={handleSignOut}
          onOpenAdmin={() => {
            setAboutOpen(false);
            setAdminOpen(true);
          }}
          onClose={() => setAboutOpen(false)}
        />
      )}

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {placeDetails && (
        <BusinessDetailPanel place={placeDetails} onGetDirections={getDirectionsToPlace} onClose={closeBusinessPanel} />
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
