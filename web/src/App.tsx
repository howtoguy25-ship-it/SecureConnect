import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Autocomplete,
  DirectionsRenderer,
  Circle,
  MarkerClusterer,
} from "@react-google-maps/api";
import type { User } from "firebase/auth";
import { ensureSignedIn, signInWithGoogle, signInWithApple, signOutUser } from "@/services/firebase";
import { upsertSignedInProfile, updateLastKnownLocation } from "@/services/userProfile";
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
import { PhoneAuthPanel } from "@/components/PhoneAuthPanel";
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
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from "@/utils/mapStyles";
import { calculateSunTimes } from "@/utils/sunTimes";
import { fetchOsmTrafficData, fetchSpeedLimitNear, type OsmPoint } from "@/services/osmTrafficData";
import { SpeedLimitSign } from "@/components/SpeedLimitSign";
import type { DetectionNavContext } from "@/components/LiveVehicleDetection";
import "./App.css";

const LIBRARIES: "places"[] = ["places"];
const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };
// Touch devices get two-finger-drag look-around during 3D Follow instead of the on-screen
// joystick (see the touch-listener effect below) -- one finger is left free for normal map
// panning. Desktop/mouse users keep the joystick since there's no touch gesture to give them.
const IS_TOUCH_DEVICE =
  typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window);
// Re-fetch directions from the live position while navigating once you've drifted this
// far from where the route was last computed — keeps ETA/remaining-distance accurate
// without hammering the Directions API on every GPS tick.
const REROUTE_THRESHOLD_KM = 0.05;

// Cached by "color:scale" so repeated calls return the *same* object reference instead of a
// fresh one on every render -- markers (alerts + every OSM traffic light/speed camera, which
// can number in the hundreds at street zoom) were otherwise getting a new `icon` prop on every
// App re-render, forcing Google Maps to re-diff/re-paint every marker on each keystroke or GPS
// tick even though the icon itself never actually changes.
const markerIconCache = new Map<string, google.maps.Symbol>();
function markerIcon(color: string, scale = 12, strokeWeight = 2): google.maps.Symbol {
  const key = `${color}:${scale}:${strokeWeight}`;
  let icon = markerIconCache.get(key);
  if (!icon) {
    icon = {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight,
      scale,
    };
    markerIconCache.set(key, icon);
  }
  return icon;
}

// Static (never changes), so build it once instead of a fresh object literal on every render
// -- but lazily, on first call, NOT as a plain top-level const. The Google Maps script that
// defines the `google` global loads asynchronously (see useJsApiLoader below); a top-level
// `const x = { path: google.maps.SymbolPath.CIRCLE, ... }` runs the instant this module is
// first evaluated by the browser, before that script has necessarily finished loading --
// `google` is undefined at that point, which threw and crashed the entire app to a blank
// white screen on every page load. Deferring the object-literal construction into a function
// (only ever called from inside JSX that's already gated on isLoaded) fixes that.
let currentLocationIconCache: google.maps.Symbol | null = null;
function currentLocationIcon(): google.maps.Symbol {
  if (!currentLocationIconCache) {
    currentLocationIconCache = {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: "#2563EB",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
      scale: 8,
    };
  }
  return currentLocationIconCache;
}

// Real, recognizable glyphs instead of plain colored dots -- a purple camera body for speed
// cameras, a green traffic-light housing (three lenses) for signals -- cached by exact pixel
// size (same lazy-build-once pattern as the functions above, for the same reason: `google`
// isn't defined yet at module-load time, only once the Maps script has actually loaded).
const speedCameraIconCache = new Map<number, google.maps.Icon>();
function speedCameraIcon(scale: number): google.maps.Icon {
  const w = Math.round(22 * scale);
  const h = Math.round(16 * scale);
  let icon = speedCameraIconCache.get(w);
  if (!icon) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 33 24">
      <rect x="1" y="5" width="24" height="15" rx="3" fill="#7C3AED" stroke="#ffffff" stroke-width="2"/>
      <rect x="24" y="9" width="7" height="8" rx="1.5" fill="#7C3AED" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="13" cy="12.5" r="5.4" fill="#ffffff"/>
      <circle cx="13" cy="12.5" r="2.8" fill="#7C3AED"/>
    </svg>`;
    icon = {
      url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(w, h),
      anchor: new google.maps.Point(w / 2, h / 2),
    };
    speedCameraIconCache.set(w, icon);
  }
  return icon;
}

const trafficLightIconCache = new Map<number, google.maps.Icon>();
function trafficLightIcon(scale: number): google.maps.Icon {
  const w = Math.round(15 * scale);
  const h = Math.round(24 * scale);
  let icon = trafficLightIconCache.get(w);
  if (!icon) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 38">
      <rect x="3" y="1" width="18" height="36" rx="7" fill="#0D9488" stroke="#ffffff" stroke-width="2"/>
      <circle cx="12" cy="10.5" r="4" fill="#ffffff" opacity="0.95"/>
      <circle cx="12" cy="19" r="4" fill="#ffffff" opacity="0.55"/>
      <circle cx="12" cy="27.5" r="4" fill="#ffffff" opacity="0.55"/>
    </svg>`;
    icon = {
      url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(w, h),
      anchor: new google.maps.Point(w / 2, h / 2),
    };
    trafficLightIconCache.set(w, icon);
  }
  return icon;
}

// Nearby OSM markers collapse into a single numbered bubble instead of rendering every one
// individually -- widening the layer's coverage to a whole metro area (see OSM_LAYER_MIN_ZOOM
// below) means a dense city block can genuinely have 30-plus signals bunched together, and
// rendering that many live map overlays at once is real, measurable render/interaction cost,
// not just visual clutter. This is the standard fix for exactly that (Google's own
// MarkerClusterer), not a workaround -- clusters split back apart into individual markers
// automatically once you zoom in close enough to tell them apart anyway.
function clusterBubbleSvg(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
    <circle cx="22" cy="22" r="19" fill="${color}" fill-opacity="0.85" stroke="#ffffff" stroke-width="2.5"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TRAFFIC_LIGHT_CLUSTER_STYLE = [
  {
    url: clusterBubbleSvg("#0D9488"),
    height: 44,
    width: 44,
    textColor: "#ffffff",
    textSize: 13,
  },
];
const SPEED_CAMERA_CLUSTER_STYLE = [
  {
    url: clusterBubbleSvg("#7C3AED"),
    height: 44,
    width: 44,
    textColor: "#ffffff",
    textSize: 13,
  },
];

// A real, classic map-pin glyph for the destination -- distinct from every other marker on
// the map (alerts, current location, OSM layer) so it's unambiguous which point you're
// actually driving to, whatever kind of place it is (house, warehouse, carpark, park...).
let destinationIconCache: google.maps.Icon | null = null;
function destinationIcon(): google.maps.Icon {
  if (!destinationIconCache) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 32 44">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28C32 7.2 24.8 0 16 0z" fill="#16A34A" stroke="#ffffff" stroke-width="2"/>
      <circle cx="16" cy="16" r="6.5" fill="#ffffff"/>
    </svg>`;
    destinationIconCache = {
      url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(34, 46),
      anchor: new google.maps.Point(17, 46),
    };
  }
  return destinationIconCache;
}

// Fetches (and shows) the OSM traffic-light/speed-camera layer from a city-wide zoom level
// on down -- zoom 11 comfortably fits an entire metro area like greater Sydney in view at
// once, so panning/zooming around a whole city surfaces its cameras/signals, not just a
// tight street-level block. Still viewport-based (whatever's currently on screen), not a
// single unbounded fetch -- a literal all-of-Australia-at-once request would be tens of
// thousands of nodes in one call and would time out against Overpass's public API, so it
// stays capped to "however wide the visible map currently is", same debounced/cached
// fetching as before, just triggered from further out.
const OSM_LAYER_MIN_ZOOM = 11;

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
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // A newly-arrived error should always show, even if the user dismissed a previous one.
  useEffect(() => {
    setBannerDismissed(false);
  }, [authError, locationError]);

  const [alerts, setAlerts] = useState<AlertDoc[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDoc | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [detectionOpen, setDetectionOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [phoneAuthOpen, setPhoneAuthOpen] = useState(false);

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
  // Starts unset each time navigation begins -- the driver picks a view instead of one being
  // forced on them, so none of the three toggle buttons shows as pre-selected.
  const [navViewMode, setNavViewMode] = useState<NavViewMode | null>(null);
  const [distanceToManeuverM, setDistanceToManeuverM] = useState<number | null>(null);
  const [streetViewUnavailable, setStreetViewUnavailable] = useState(false);
  const [speedLimitKmh, setSpeedLimitKmh] = useState<number | null>(null);
  const lastSpeedLimitFetchRef = useRef<google.maps.LatLngLiteral | null>(null);
  const speedLimitFetchInFlightRef = useRef(false);
  // A small explainer bubble the first few times the "hide AI Detection route guide" button
  // is tapped -- it only visibly does anything once you're actually inside AI Detection, so
  // on the plain map screen it can look like it does nothing at all. Shown at most 3 times
  // ever (persisted in localStorage, not just this session), then never again.
  const [trailTip, setTrailTip] = useState<string | null>(null);
  const trailTipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onToggleHideTrace = useCallback(() => {
    const next = !settings.hideDetectionTrace;
    setHideDetectionTrace(next);

    const key = "trackline.hideTraceTipShownCount";
    const shown = Number(localStorage.getItem(key) ?? "0");
    if (shown < 3) {
      localStorage.setItem(key, String(shown + 1));
      setTrailTip(
        next
          ? "Route guide line will be hidden next time you open AI Detection"
          : "Route guide line will show again next time you open AI Detection"
      );
      if (trailTipTimeoutRef.current) clearTimeout(trailTipTimeoutRef.current);
      trailTipTimeoutRef.current = setTimeout(() => setTrailTip(null), 3500);
    }
  }, [settings.hideDetectionTrace, setHideDetectionTrace]);
  // Ticks while navigating purely to force a re-render every ~150ms so the destination
  // highlight's pulse (a real, computed Math.sin wave, read at render time below) animates
  // smoothly instead of only updating whenever something else happens to re-render the app.
  const [, setPulseTick] = useState(0);
  useEffect(() => {
    if (!navigating) return;
    const id = setInterval(() => setPulseTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, [navigating]);
  const lastLocationSyncRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  // Drives the smoothed 3D Follow camera rotation (see the rAF loop below) -- "target" is
  // where the GPS/manual-offset math says the camera should point right now, "displayed" is
  // what's actually been pushed to the map, eased toward the target every frame instead of
  // snapping straight to it. Keeps turns/GPS jitter from producing a visible whip-pan.
  const targetHeadingRef = useRef(0);
  const displayedHeadingRef = useRef(0);
  const lastAppliedTiltRef = useRef<number | null>(null);
  const lastLocationRef = useRef<google.maps.LatLngLiteral | null>(null);
  // Joystick-driven adjustments to the 3D Follow camera, layered on top of the
  // auto-computed travel heading/default tilt so the driver can nudge the view to
  // wherever feels comfortable. Reset via the recenter button.
  const [manualHeadingOffset, setManualHeadingOffset] = useState(0);
  const [manualTiltOverride, setManualTiltOverride] = useState<number | null>(null);

  // Real traffic-signal/speed-camera locations from OpenStreetMap, refreshed as the
  // visible map area changes (see onMapIdle below).
  const [osmTrafficLights, setOsmTrafficLights] = useState<OsmPoint[]>([]);
  const [osmSpeedCameras, setOsmSpeedCameras] = useState<OsmPoint[]>([]);
  const osmFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOsmBoundsRef = useRef<google.maps.LatLngBounds | null>(null);

  // "View in 3D?" prompt — triggers automatically on reaching max zoom for this location
  // (native double-click-to-zoom-in is left on, so a double-click here counts too). A plain
  // single click while already at max zoom (see onClick below) just zooms back out again,
  // no priming/arming step needed.
  const [maxZoomHere, setMaxZoomHere] = useState<number | null>(null);
  // Drives the OSM traffic-light/speed-camera icon size below -- compact at a city-wide
  // view (so hundreds of markers don't clutter it), normal size at street level, bigger
  // once you're zoomed in close. Only updates on whole zoom levels (see onZoomChanged),
  // not continuously during a pinch gesture.
  const [mapZoomLevel, setMapZoomLevel] = useState<number | null>(null);
  const [show3DPrompt, setShow3DPrompt] = useState(false);
  const [street3DMode, setStreet3DMode] = useState(false);
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

  // Offers real night-mode map switching keyed to actual local sunset at the user's
  // location (see utils/sunTimes.ts), not just OS dark-mode preference -- a phone can be in
  // light mode all day while it's genuinely dark outside. Asks at most once per sunset ->
  // sunrise cycle (remembered in localStorage by that sunset's date so it naturally resets
  // every day); skipped entirely once the theme is already explicitly set to dark.
  const [showNightPrompt, setShowNightPrompt] = useState(false);
  const nightPromptCycleRef = useRef<string | null>(null);

  useEffect(() => {
    const loc = location;
    if (!loc || settings.theme === "dark") return;

    function checkSunset() {
      const now = new Date();
      const times = calculateSunTimes(loc!.lat, loc!.lng, now);
      if (!times || (now >= times.sunrise && now <= times.sunset)) return; // daytime, or polar edge case
      const cycleKey = times.sunset.toDateString();
      if (localStorage.getItem("trackline.nightPromptDismissedFor") === cycleKey) return;
      nightPromptCycleRef.current = cycleKey;
      setShowNightPrompt(true);
    }

    checkSunset();
    const interval = setInterval(checkSunset, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [location?.lat, location?.lng, settings.theme]);

  const acceptNightMode = useCallback(() => {
    setTheme("dark");
    setShowNightPrompt(false);
  }, [setTheme]);

  const declineNightMode = useCallback(() => {
    if (nightPromptCycleRef.current) {
      localStorage.setItem("trackline.nightPromptDismissedFor", nightPromptCycleRef.current);
    }
    setShowNightPrompt(false);
  }, []);

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

  // Last-known location for the admin panel (see userProfile.ts) -- refreshed at most every
  // 5 minutes or every 0.5km moved, whichever comes first, so a real signed-in account's
  // location stays reasonably current for support/moderation purposes without writing to
  // Firestore on every single GPS tick. No-op for guests (updateLastKnownLocation itself
  // checks isAnonymous too, matching the sign-in-history sync above).
  useEffect(() => {
    if (!user || user.isAnonymous || !location) return;
    const last = lastLocationSyncRef.current;
    const now = Date.now();
    if (last && now - last.at < 5 * 60 * 1000 && distanceKm(last.lat, last.lng, location.lat, location.lng) < 0.5) {
      return;
    }
    lastLocationSyncRef.current = { lat: location.lat, lng: location.lng, at: now };
    updateLastKnownLocation(user, location.lat, location.lng).catch((err) =>
      console.warn("[profile] location sync failed", err)
    );
  }, [user, location?.lat, location?.lng]);

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

  const handlePhoneSignedIn = useCallback((signedInUser: User) => {
    setUser(signedInUser);
    setPhoneAuthOpen(false);
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
    let currentHeading = heading;
    if (last) {
      const movedKm = distanceKm(last.lat, last.lng, location.lat, location.lng);
      if (movedKm > 0.003) {
        currentHeading = bearingDegrees(last.lat, last.lng, location.lat, location.lng);
        setHeading(currentHeading);
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

    // Reasserted every tick (not just on mode change) so the 3D camera can't get stuck
    // flattened out -- Google's renderer silently drops tilt below a certain zoom level,
    // and a wide zoom-out (deliberate or accidental) would otherwise never self-correct
    // while stationary, since nothing else would re-trigger it.
    if (navViewMode === "follow") {
      const map = mapRef.current;
      if (map) {
        map.panTo(location);
        const currentZoom = map.getZoom();
        if (currentZoom !== undefined && currentZoom < 16) {
          map.setZoom(18);
        }
        // Only pushed to the map when it actually changed -- calling setTilt every single
        // GPS tick with the same value still makes the vector renderer redo work it didn't
        // need to, which is part of what reads as "blurry"/stuttery during a steady drive.
        const targetTilt = manualTiltOverride ?? 67.5;
        if (lastAppliedTiltRef.current !== targetTilt) {
          map.setTilt(targetTilt);
          lastAppliedTiltRef.current = targetTilt;
        }
        // Heading is NOT set directly here -- it only updates the target that the smoothing
        // loop below eases the camera toward, so turns/GPS jitter ease into place instead of
        // whip-panning to the new bearing every tick.
        targetHeadingRef.current = (currentHeading + manualHeadingOffset + 360) % 360;
      }
    }
  }, [location?.lat, location?.lng, navigating, navViewMode, manualHeadingOffset, manualTiltOverride]);

  // Smoothly eases the 3D Follow camera's heading toward targetHeadingRef every frame
  // instead of snapping to it -- exponential ease (each frame closes ~14% of the remaining
  // angular gap) reads as a natural, weighted turn like a real nav app instead of a jump-cut,
  // while still catching up to a moving target within well under a second. Only runs while
  // actually in follow mode so it doesn't burn frames the rest of the time.
  useEffect(() => {
    if (!navigating || navViewMode !== "follow") return;
    const map = mapRef.current;
    if (!map) return;

    displayedHeadingRef.current = map.getHeading() ?? targetHeadingRef.current;
    let rafId: number;

    function tick() {
      const current = displayedHeadingRef.current;
      const target = targetHeadingRef.current;
      const delta = ((target - current + 540) % 360) - 180;
      if (Math.abs(delta) > 0.05) {
        displayedHeadingRef.current = (current + delta * 0.14 + 360) % 360;
        map?.setHeading(displayedHeadingRef.current);
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [navigating, navViewMode]);

  // Real posted speed limit for the road the driver is currently on, from OpenStreetMap's
  // maxspeed tags (see osmTrafficData.ts) -- refetched only after moving ~50m so a live GPS
  // track doesn't hammer the Overpass API every tick, and skipped entirely while a fetch is
  // already in flight.
  useEffect(() => {
    if (!navigating || !location) return;
    const last = lastSpeedLimitFetchRef.current;
    if (last && distanceKm(last.lat, last.lng, location.lat, location.lng) < 0.05) return;
    if (speedLimitFetchInFlightRef.current) return;

    lastSpeedLimitFetchRef.current = location;
    speedLimitFetchInFlightRef.current = true;
    fetchSpeedLimitNear(location.lat, location.lng)
      .then((result) => setSpeedLimitKmh(result?.kmh ?? null))
      .catch(() => setSpeedLimitKmh(null))
      .finally(() => {
        speedLimitFetchInFlightRef.current = false;
      });
  }, [navigating, location?.lat, location?.lng]);

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
    if (!map) return;
    const zoom = map.getZoom();
    if (zoom === undefined) return;
    // Rounded to whole levels -- the OSM marker icon sizing below reads this, and only
    // needs to change a handful of times across a zoom gesture, not on every fractional
    // in-between value a pinch can report.
    setMapZoomLevel(Math.round(zoom));

    if (maxZoomHere === null) return;
    if (zoom >= maxZoomHere) {
      if (!promptedAtMaxZoomRef.current && !street3DMode) {
        promptedAtMaxZoomRef.current = true;
        setShow3DPrompt(true);
      }
    } else {
      promptedAtMaxZoomRef.current = false;
    }
  }, [maxZoomHere, street3DMode]);

  // Fetches real OSM traffic-signal/speed-camera data for the visible area once settled
  // (debounced) at street-level zoom, skipping the request entirely when the current
  // viewport is already covered by the last fetch so panning around a small area doesn't
  // keep re-querying Overpass's shared public endpoint.
  const onMapIdle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = map.getZoom();
    if (zoom === undefined || zoom < OSM_LAYER_MIN_ZOOM) return;
    const bounds = map.getBounds();
    if (!bounds) return;

    const last = lastOsmBoundsRef.current;
    if (last && last.contains(bounds.getNorthEast()) && last.contains(bounds.getSouthWest())) {
      return;
    }

    if (osmFetchTimeoutRef.current) clearTimeout(osmFetchTimeoutRef.current);
    osmFetchTimeoutRef.current = setTimeout(() => {
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      // Pad the fetched area so small subsequent pans don't immediately re-trigger.
      const latPad = (ne.lat() - sw.lat()) * 0.5;
      const lngPad = (ne.lng() - sw.lng()) * 0.5;
      const paddedBounds = new google.maps.LatLngBounds(
        { lat: sw.lat() - latPad, lng: sw.lng() - lngPad },
        { lat: ne.lat() + latPad, lng: ne.lng() + lngPad }
      );
      lastOsmBoundsRef.current = paddedBounds;
      fetchOsmTrafficData(paddedBounds)
        .then(({ trafficLights, speedCameras }) => {
          // Capped defensively -- raised well above the old street-level limits now that a
          // whole metro area's worth of results can come back in one fetch, but still a hard
          // ceiling so an extreme case can't hand hundreds of thousands of markers to render.
          setOsmTrafficLights(trafficLights.slice(0, 1500));
          setOsmSpeedCameras(speedCameras.slice(0, 600));
        })
        .catch((err) => console.warn("[osm] traffic data fetch failed", err));
    }, 1200);
  }, []);

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
    setStreet3DMode(true);
    mapRef.current?.setTilt(67.5);
  }, []);

  const declineStreet3D = useCallback(() => {
    setShow3DPrompt(false);
  }, []);

  const exitStreet3D = useCallback(() => {
    setStreet3DMode(false);
    mapRef.current?.setTilt(0);
    mapRef.current?.setHeading(0);
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

  // 3D Follow's joystick: unlike Street 3D's, these persist as state (not just direct map
  // calls) since the per-tick tracking effect reasserts the camera every location update
  // and would otherwise immediately overwrite a direct map.setHeading/setTilt call.
  const rotateFollow = useCallback((deltaDeg: number) => {
    setManualHeadingOffset((prev) => (prev + deltaDeg + 360) % 360);
  }, []);

  const tiltFollow = useCallback((deltaDeg: number) => {
    setManualTiltOverride((prev) => Math.max(0, Math.min(67.5, (prev ?? 67.5) + deltaDeg)));
  }, []);

  // Two-finger look-around during 3D Follow, replacing the on-screen joystick entirely:
  // a two-finger drag adjusts heading/tilt (feeding the same manual offsets the old joystick
  // buttons did) -- horizontal movement rotates the view, vertical movement ("lift" the
  // fingers up/down) digs the camera deeper into/out of the tilt angle. One finger is left
  // completely alone so it keeps doing normal native map panning/dragging, exactly like the
  // home map screen -- only a *second* simultaneous touch engages look-around, so there's no
  // ambiguity between "I'm panning" and "I'm looking around".
  useEffect(() => {
    if (!navigating || navViewMode !== "follow") return;
    const map = mapRef.current;
    if (!map) return;
    const div = map.getDiv();

    let lastX: number | null = null;
    let lastY: number | null = null;

    function midpoint(touches: TouchList): { x: number; y: number } {
      const a = touches[0];
      const b = touches[1];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 2) {
        lastX = null;
        lastY = null;
        return;
      }
      const mid = midpoint(e.touches);
      lastX = mid.x;
      lastY = mid.y;
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 2 || lastX === null || lastY === null) return;
      const mid = midpoint(e.touches);
      const dx = mid.x - lastX;
      const dy = mid.y - lastY;
      lastX = mid.x;
      lastY = mid.y;
      rotateFollow(dx * 0.3);
      tiltFollow(-dy * 0.3);
    }
    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        lastX = null;
        lastY = null;
      }
    }

    div.addEventListener("touchstart", onTouchStart, { passive: true });
    div.addEventListener("touchmove", onTouchMove, { passive: true });
    div.addEventListener("touchend", onTouchEnd, { passive: true });
    div.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      div.removeEventListener("touchstart", onTouchStart);
      div.removeEventListener("touchmove", onTouchMove);
      div.removeEventListener("touchend", onTouchEnd);
      div.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [navigating, navViewMode, rotateFollow, tiltFollow]);

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
    setNavViewMode(null);
    setActiveStepIndex(0);
    setRouteOrigin(location);
    lastLocationRef.current = location;
  }, [location]);

  const endNavigation = useCallback(() => {
    setNavigating(false);
    setHeading(0);
    setSpeedLimitKmh(null);
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
    if (!navigating) {
      mapRef.current?.setZoom(15);
    } else {
      // Also doubles as "reset the 3D Follow view" -- clears any joystick adjustment.
      setManualHeadingOffset(0);
      setManualTiltOverride(null);
    }
  }, [location, navigating]);

  // Seeds the map's center exactly once, the first time a real GPS fix arrives -- NOT
  // reactively tied to `location` on every tick. <GoogleMap>'s `center` prop is controlled:
  // the wrapper library calls map.setCenter() any time this value's object reference changes,
  // which used to happen on every single GPS update (useGeolocation hands back a fresh
  // {lat,lng} object each time). That meant freely panning/dragging around the map got
  // periodically yanked back to your live position mid-drag -- the "little delay"/jank
  // reported when moving the map. Ongoing recentering is already handled imperatively
  // elsewhere (the recenter button, and the 3D Follow effect's own map.panTo() calls), so
  // this only ever needs to fire once.
  const [center, setCenter] = useState<google.maps.LatLngLiteral>(DEFAULT_CENTER);
  const centerSeededRef = useRef(false);
  useEffect(() => {
    if (location && !centerSeededRef.current) {
      centerSeededRef.current = true;
      setCenter(location);
    }
  }, [location]);

  if (!isLoaded) {
    return (
      <div className="loading-screen">
        <img src="/logo.png" alt="TrackLine" className="loading-logo" />
        Loading map…
      </div>
    );
  }

  // Hides the browse-mode chrome (search bar, radius panel, about button, FABs) whenever
  // any full-panel overlay is open on top of it, instead of letting them show through
  // behind/around the panel.
  const chromeHidden =
    pendingType !== null || navigating || aboutOpen || phoneAuthOpen || adminOpen || reportOpen || detectionOpen;

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

  const bannerVisible = Boolean(statusMessage) && !bannerDismissed;
  // Both the error banner and the top-pinned 3D-view prompt live at the very top of the
  // screen -- whichever one is showing, the search bar/about button/radius control shift
  // down out of its way so nothing overlaps.
  const topBannerActive = bannerVisible || show3DPrompt;
  // Compact at a city-wide view (a whole metro area's worth of markers shouldn't clutter
  // it), normal size at ordinary street-browsing zoom, bigger once zoomed in close --
  // navigating always gets at least the "zoomed in" size, since visibility while actually
  // driving matters more than decluttering.
  const osmZoomTierScale = mapZoomLevel === null ? 1 : mapZoomLevel >= 17 ? 1.3 : mapZoomLevel >= 14 ? 1 : 0.7;
  const osmIconScale = navigating ? Math.max(osmZoomTierScale, 1.4) : osmZoomTierScale;

  return (
    <div className="app-root">
      {bannerVisible && (
        <div className="status-banner">
          <span>{statusMessage}</span>
          <button className="status-banner-close" onClick={() => setBannerDismissed(true)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <GoogleMap
        onLoad={(map) => {
          mapRef.current = map;
        }}
        center={center}
        zoom={location ? 15 : 11}
        // Left undefined during 3D Follow -- heading is applied imperatively by the smoothing
        // rAF loop above instead. This is a *controlled* prop: feeding it the raw, unsmoothed
        // `heading` state here would fire the library's own map.setHeading() on every GPS
        // tick and fight the smoothing loop for control, snapping the camera right back to
        // the unsmoothed bearing every time -- exactly the jumpiness the loop exists to fix.
        heading={navigating && navViewMode === "follow" ? undefined : 0}
        tilt={(navigating && navViewMode === "follow") || street3DMode ? 67.5 : 0}
        mapContainerClassName="map-container"
        onZoomChanged={onZoomChanged}
        onIdle={onMapIdle}
        options={{
          disableDefaultUI: true,
          // Native zoom control is off -- custom-positioned +/- buttons are rendered below
          // instead. The native control's zoomControlOptions.position is unreliable on
          // vector (Map ID) maps -- it was landing bottom-right and overlapping the FAB
          // column no matter what position was requested, so this sidesteps that entirely
          // by taking full control of where it sits.
          zoomControl: false,
          draggable: true,
          // "greedy" makes a single finger always pan the map, full stop -- the default
          // ("auto") detects when a map might be embedded in a scrollable page and falls
          // back to requiring two fingers (showing a "use two fingers to move the map"
          // hint) so the page itself can still scroll underneath it. This app has no page
          // scroll to protect -- the map IS the screen -- so that fallback only got in the
          // way and, worse, let an unclaimed one-finger drag bubble up as a native page
          // scroll (see the html/body lockdown in App.css).
          gestureHandling: "greedy",
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
          // separately-configured dark/light Map ID for that case instead) -- only apply
          // these here when there's no Map ID to conflict with.
          styles: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID
            ? undefined
            : isDarkTheme
              ? DARK_MAP_STYLE
              : LIGHT_MAP_STYLE,
        }}
        onClick={(e) => {
          const placeEvent = e as google.maps.MapMouseEvent & { placeId?: string };
          if (pendingType && e.latLng) {
            setPendingLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          } else if (addingStop && e.latLng) {
            setStopLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            setAddingStop(false);
          } else if (placeEvent.placeId) {
            placeEvent.stop();
            setSelectedPlaceId(placeEvent.placeId);
          }
          // A plain tap on empty map (not a placement, not a POI) used to auto-zoom back out
          // once you'd reached max zoom -- meant as a "tap to zoom out" shortcut, but it fired
          // on *any* ordinary tap up there, so exploring around at max zoom kept getting
          // yanked back out from underneath you. Removed -- zoom in as far as you want, and
          // use the zoom -/pinch to actually zoom out when you mean to.
        }}
      >
        {location && (
          <Marker position={location} icon={currentLocationIcon()} />
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

        {/* Real OpenStreetMap data -- see osmTrafficData.ts for what "real" means here
            (community-mapped, not an official feed). Purple camera glyph = speed camera,
            green traffic-light glyph = signal -- compact at a city-wide view, normal size
            browsing at street level, bigger zoomed in close or while navigating. Nearby ones
            cluster into a numbered bubble (see clusterBubbleSvg above) until you're zoomed in
            past street level, instead of rendering potentially dozens of individual markers
            on top of each other in a dense area. */}
        <MarkerClusterer
          options={{ styles: TRAFFIC_LIGHT_CLUSTER_STYLE, maxZoom: 16, gridSize: 50 }}
        >
          {(clusterer) => (
            <>
              {osmTrafficLights.map((point) => (
                <Marker
                  key={`tl-${point.id}`}
                  position={{ lat: point.lat, lng: point.lng }}
                  icon={trafficLightIcon(osmIconScale)}
                  title="Traffic signal (OpenStreetMap data)"
                  clusterer={clusterer}
                />
              ))}
            </>
          )}
        </MarkerClusterer>
        <MarkerClusterer options={{ styles: SPEED_CAMERA_CLUSTER_STYLE, maxZoom: 16, gridSize: 50 }}>
          {(clusterer) => (
            <>
              {osmSpeedCameras.map((point) => (
                <Marker
                  key={`sc-${point.id}`}
                  position={{ lat: point.lat, lng: point.lng }}
                  icon={speedCameraIcon(osmIconScale)}
                  title="Speed camera (OpenStreetMap data)"
                  clusterer={clusterer}
                />
              ))}
            </>
          )}
        </MarkerClusterer>

        {pendingLocation && (
          <Marker
            position={pendingLocation}
            draggable
            onDragEnd={(e) => {
              if (e.latLng) setPendingLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }}
            icon={markerIcon(pendingType ? ALERT_COLORS[pendingType] : "#2563EB", 14, 3)}
            zIndex={999}
          />
        )}

        {stopLocation && (
          <Marker
            position={stopLocation}
            onClick={() => setStopLocation(null)}
            title="Stop (click to remove)"
            icon={markerIcon("#F59E0B", 10, 3)}
            zIndex={998}
          />
        )}

        {directions && (
          <DirectionsRenderer directions={directions} options={{ suppressMarkers: true }} />
        )}

        {/* A real pin so you can actually see which building/spot you're headed to -- house,
            warehouse, carpark, park, whatever it is -- instead of the route just ending with
            nothing marking it. The green ring is a genuine live-computed pulse (not a static
            image), and grows visually more prominent as you approach purely because 3D
            Follow zooms in tighter the whole drive, without needing to know the destination's
            actual building footprint (not available through this API). */}
        {destination && <Marker position={destination} icon={destinationIcon()} zIndex={950} />}
        {navigating && destination && (
          <Circle
            center={destination}
            radius={16 + (0.55 + 0.45 * Math.sin(Date.now() / 450)) * 8}
            options={{
              strokeColor: "#16A34A",
              strokeOpacity: 0.9,
              strokeWeight: 2,
              fillColor: "#16A34A",
              fillOpacity: 0.12 + (0.55 + 0.45 * Math.sin(Date.now() / 450)) * 0.14,
              clickable: false,
            }}
          />
        )}
      </GoogleMap>

      <div className="zoom-control">
        <button
          onClick={() => {
            const map = mapRef.current;
            if (map) map.setZoom((map.getZoom() ?? 15) + 1);
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => {
            const map = mapRef.current;
            if (map) map.setZoom((map.getZoom() ?? 15) - 1);
          }}
          aria-label="Zoom out"
        >
          −
        </button>
      </div>

      {!chromeHidden && (
        <button
          className={`about-button${topBannerActive ? " chrome-shifted" : ""}`}
          onClick={() => setAboutOpen(true)}
          aria-label="About TrackLine"
        >
          <img src="/logo.png" alt="" />
        </button>
      )}

      {!chromeHidden && (
        <div className={`top-bar${topBannerActive ? " chrome-shifted" : ""}`}>
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

      {!chromeHidden && (
        <div className={`radius-control${topBannerActive ? " chrome-shifted" : ""}`}>
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
        <StreetViewNav
          position={location}
          heading={heading}
          destination={destination}
          onNoCoverage={onStreetViewNoCoverage}
        />
      )}

      {navigating && speedLimitKmh !== null && <SpeedLimitSign kmh={speedLimitKmh} />}

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

      {!chromeHidden && (
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

          {trailTip && <div className="trail-tip">{trailTip}</div>}
          <button
            className={`fab fab-quaternary${settings.hideDetectionTrace ? " fab-toggle-active" : ""}`}
            onClick={onToggleHideTrace}
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

      {navigating && navViewMode === "follow" && !IS_TOUCH_DEVICE && (
        <Street3DJoystick onRotate={rotateFollow} onTilt={tiltFollow} />
      )}

      {show3DPrompt && (
        <ConfirmPrompt
          message="Do you want to view 3D?"
          onYes={enterStreet3D}
          onNo={declineStreet3D}
          variant="top"
        />
      )}

      {showNightPrompt && !aboutOpen && !phoneAuthOpen && !adminOpen && !reportOpen && !detectionOpen && (
        <ConfirmPrompt
          message="It's sunset — switch the map to night mode?"
          yesLabel="Night mode"
          noLabel="Stay day"
          onYes={acceptNightMode}
          onNo={declineNightMode}
        />
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
          onSignInPhone={() => {
            setAboutOpen(false);
            setPhoneAuthOpen(true);
          }}
          onSignOut={handleSignOut}
          onOpenAdmin={() => {
            setAboutOpen(false);
            setAdminOpen(true);
          }}
          onClose={() => setAboutOpen(false)}
        />
      )}

      {phoneAuthOpen && (
        <PhoneAuthPanel onSignedIn={handlePhoneSignedIn} onCancel={() => setPhoneAuthOpen(false)} />
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
