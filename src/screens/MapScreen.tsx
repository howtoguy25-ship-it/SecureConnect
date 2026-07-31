import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Share, ActivityIndicator } from "react-native";
import MapView, {
  PROVIDER_GOOGLE,
  Polyline,
  Marker,
  Circle,
  type Region,
  type MapPressEvent,
} from "react-native-maps";
import { Map3DView, isMap3DSupported, type Map3DViewHandle } from "map3d";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import BottomSheet from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import { MAP_THEME_STYLES } from "@/utils/mapStyle";

import { useLocation } from "@/context/LocationContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { MuteButton } from "@/components/MuteButton";
import { DestinationSearchBar } from "@/components/DestinationSearchBar";
import { NavigationInstructionCard } from "@/components/NavigationInstructionCard";
import { RouteDirectionsSheet } from "@/screens/RouteDirectionsSheet";
import { RouteOptionsCard } from "@/components/RouteOptionsCard";
import { AlertMarker } from "@/components/AlertMarker";
import { AlertBanner } from "@/components/AlertBanner";
import { BannerAdBar } from "@/components/BannerAdBar";
import { AdsErrorBoundary } from "@/components/AdsErrorBoundary";
import { AlertReportSheet } from "@/screens/AlertReportSheet";
import { AlertDetailSheet } from "@/screens/AlertDetailSheet";
import { PlaceInfoSheet } from "@/screens/PlaceInfoSheet";
import { OsmMarkerSheet, type OsmMarkerKind } from "@/screens/OsmMarkerSheet";
import {
  getRouteOptions,
  getDirectionsForMode,
  DirectionsApiError,
  type Route,
  type RouteProfileKey,
  type TravelMode,
} from "@/services/directions";
import { findNearestPlace, getPlaceInfo, type PlaceDetails, type PlaceInfo } from "@/services/places";
import { distanceKm, bearingDegrees } from "@/utils/geo";
import type { LatLng } from "@/utils/polyline";
import { createGuidanceState, evaluateGuidance } from "@/services/navigationGuidance";
import { speak, stopSpeaking } from "@/services/voice";
import { formatArrivalClock } from "@/utils/navFormat";
import {
  subscribeNearbyAlerts,
  reportAlert,
  deleteAlert,
  hideAlertForUser,
  confirmAlert,
} from "@/services/alerts";
import { sirenDetection } from "@/services/sirenDetection";
import { fetchOsmTrafficData, type OsmTrafficData } from "@/services/osmTrafficData";
import { VehicleDetectionScreen } from "@/screens/VehicleDetectionScreen";
import { VehicleDetectionErrorBoundary } from "@/components/VehicleDetectionErrorBoundary";
import type { AlertDoc, AlertType } from "@/types/alert";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { Sentry } from "@/services/sentry";

const DIAGNOSTIC_DISABLE_MAPVIEW = false;
// See onMapPress's POI lookup -- rankby=distance has no radius bound, so this is the sanity
// check that keeps an empty tap (open water, a park, a gap between buildings) from confidently
// showing whatever real business happens to be nearest, however far that actually is.
const MAX_POI_TAP_DISTANCE_METERS = 120;

export function MapScreen() {
  const { location } = useLocation();
  const { user } = useAuth();
  const { settings, voiceEnabled, voiceVolume } = useSettings();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView>(null);
  const reportSheetRef = useRef<BottomSheet>(null);
  const detailSheetRef = useRef<BottomSheet>(null);
  const placeInfoSheetRef = useRef<BottomSheet>(null);
  const osmMarkerSheetRef = useRef<BottomSheet>(null);
  const directionsSheetRef = useRef<BottomSheet>(null);

  const [route, setRoute] = useState<Route | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  // Real measured height of NavigationInstructionCard (see its onHeightChange) -- the button
  // column below it (Recenter/mute/settings) positions off this instead of a fixed guess, so
  // it never ends up partly hidden behind a taller-than-expected card. 96 is just the
  // reasonable single-line fallback for the one frame before the first real measurement lands.
  const [instructionCardHeight, setInstructionCardHeight] = useState(96);
  // Same pattern as instructionCardHeight above, for RouteOptionsCard (see its onHeightChange)
  // -- the route-preview polyline's fitToCoordinates bottom padding uses this real number
  // instead of a fixed guess, so the previewed route never ends up partly hidden behind the
  // card. 320 is a reasonable fallback for the one frame before the first real measurement.
  const [routeCardHeight, setRouteCardHeight] = useState(320);
  const guidanceRef = useRef(createGuidanceState());
  // Exact arrival coordinate for the highlighted destination marker below -- kept separate
  // from route.polyline's last point so it's the real picked place, not whatever pixel the
  // polyline decoder happened to end on.
  const [destinationLatLng, setDestinationLatLng] = useState<LatLng | null>(null);
  // "hybrid" = satellite imagery + road/place labels, not bare "satellite" -- an unlabeled
  // satellite view is close to unusable while actually navigating, and this is what most map
  // apps' own "Satellite" button actually switches to.
  const [mapType, setMapType] = useState<"standard" | "hybrid">("standard");

  // Route-choice flow: destination picked -> fetch all 3 profiles -> user picks one (with a
  // live preview of that profile's line on the map) -> Start commits it into `route` above.
  const [pendingDestination, setPendingDestination] = useState<PlaceDetails | null>(null);
  const [stopLocation, setStopLocation] = useState<LatLng | null>(null);
  const [pickingStop, setPickingStop] = useState(false);
  const [routeOptions, setRouteOptions] = useState<Record<RouteProfileKey, Route> | null>(null);
  // Driving gets the 3-way Normal/Fastest/Safest picker above; every other travel mode gets a
  // single real route here instead -- Google has exactly one meaningful route per mode in the
  // overwhelming majority of cases (transit in particular is governed by real timetables, not
  // alternative road choices), so a 3-way picker wouldn't mean anything for them.
  const [modeRoute, setModeRoute] = useState<Route | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [loadingRouteOptions, setLoadingRouteOptions] = useState(false);
  const [routeOptionsError, setRouteOptionsError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RouteProfileKey>("normal");

  const [nearbyAlerts, setNearbyAlerts] = useState<AlertDoc[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDoc | null>(null);

  // Static OSM traffic-light/speed-camera layer -- fetched per visible map region (debounced
  // on region-change-complete, gated behind a min-zoom so a zoomed-out view doesn't fire an
  // Overpass query over a huge area), independent of the live community AlertType markers.
  const [osmData, setOsmData] = useState<OsmTrafficData | null>(null);
  const [osmLoading, setOsmLoading] = useState(false);
  const osmDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bannerVisible, setBannerVisible] = useState(false);
  const [placingAlert, setPlacingAlert] = useState(false);
  // Tracks whether either alert sheet is actually open (not just mounted -- both are always
  // mounted, controlled via ref) so the FAB column below can hide itself while a sheet
  // covers most of the screen -- previously the FABs stayed rendered at their normal
  // position underneath, and whichever one happened to sit just above the sheet's top edge
  // showed as an oddly clipped sliver peeking out from behind it.
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [placeInfoSheetOpen, setPlaceInfoSheetOpen] = useState(false);
  const [directionsSheetOpen, setDirectionsSheetOpen] = useState(false);
  const [osmMarkerSheetOpen, setOsmMarkerSheetOpen] = useState(false);
  const anySheetOpen =
    reportSheetOpen || detailSheetOpen || placeInfoSheetOpen || osmMarkerSheetOpen || directionsSheetOpen;
  const [alertPlacementLatLng, setAlertPlacementLatLng] = useState<LatLng | null>(null);

  // Real "tap a shop, see its info" -- iOS's native MapKit provider here has no onPoiClick
  // event (react-native-maps only fires that on Google Maps/Android), so instead any map tap
  // looks up whatever business is closest to that point via Places Nearby Search + Details.
  const [placeInfo, setPlaceInfo] = useState<PlaceInfo | null>(null);
  const [placeInfoLoading, setPlaceInfoLoading] = useState(false);

  const [osmMarkerKind, setOsmMarkerKind] = useState<OsmMarkerKind | null>(null);
  const [osmMarkerLocation, setOsmMarkerLocation] = useState<LatLng | null>(null);
  const onOsmMarkerPress = useCallback((kind: OsmMarkerKind, location: LatLng) => {
    setOsmMarkerKind(kind);
    setOsmMarkerLocation(location);
    osmMarkerSheetRef.current?.expand();
  }, []);
  const [bannerMessage, setBannerMessage] = useState("");
  const [detectionOpen, setDetectionOpen] = useState(false);
  // Real photorealistic 3D satellite (Android only for now, see modules/map3d) -- Stage 1:
  // core rendering + live position + the active route only, mirroring the web build's own
  // staged rollout. Renders as an overlay on top of the existing MapView, matching how the
  // web version layers its own Map3DElement over the classic 2D map.
  const [show3D, setShow3D] = useState(false);
  // Tilted, near-horizontal "front view" of the 3D tiles/buildings on top of the default
  // top-down 3D angle -- the module's own `tilt(deltaDeg)` is relative, not absolute, but
  // since Map3DView is only ever mounted while show3D is true (unmounts fully when it's
  // toggled off), each mount starts from the same default camera, so a fixed +60/-60 delta
  // pair is a safe, always-correct toggle rather than needing to track absolute angle.
  const [frontView, setFrontView] = useState(false);
  const map3DRef = useRef<Map3DViewHandle>(null);

  useEffect(() => {
    if (!show3D) setFrontView(false);
  }, [show3D]);

  const toggleFrontView = useCallback(() => {
    setFrontView((was) => {
      const next = !was;
      map3DRef.current?.tilt(next ? 60 : -60);
      return next;
    });
  }, []);

  // Apple-Maps-style close-follow camera: tilted, zoomed in, rotates to match the direction
  // of travel. Uses react-native-maps' own `camera`/`animateCamera` API (pitch/heading/zoom),
  // NOT the custom Map3DView module above -- a standard MapView camera call, zero native-module
  // risk, which matters given the iOS crash history around the custom 3D module. Defaults on
  // whenever navigation starts, and the user can drop back to a flat top-down view without
  // exiting navigation entirely.
  const [followTilt, setFollowTilt] = useState(true);

  const currentLatLng = useMemo(
    () =>
      location
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : null,
    [location]
  );

  // `initialRegion` above is a mount-time-only prop, so it never moves the map once the very
  // first real GPS fix actually lands -- this is that correction, firing exactly once as soon
  // as a real position exists (skipped while navigating since confirmRoute/the chase-cam
  // effects already own the camera then). Without this, a location permission grant + first fix
  // landing even a moment after the map's first render left the map stuck on the placeholder
  // coordinate for the rest of the session -- the real, confirmed "why is it showing San
  // Francisco" bug, not a rare edge case.
  const recenteredOnFixRef = useRef(false);
  useEffect(() => {
    if (recenteredOnFixRef.current || !currentLatLng || route) return;
    recenteredOnFixRef.current = true;
    mapRef.current?.animateCamera({ center: currentLatLng }, { duration: 500 });
  }, [currentLatLng, route]);

  // GPS "course" heading (location.coords.heading) is a real device/OS-reported value, but a
  // genuinely unreliable one -- iOS commonly reports it as -1 ("invalid") at low speed, right
  // after a stop, or for a few fixes after starting to move again, which is exactly when a
  // driver is most likely to be turning onto a new street. Defaulting straight to 0 in that
  // case (the old behavior) meant the map silently snapped to "facing north" and stayed there
  // instead of rotating with an actual turn -- a real, confirmed bug, not just a rare edge case.
  // The fallback below derives a real heading from the bearing between the last two GPS fixes
  // instead of giving up -- genuine, live movement direction, just computed from position deltas
  // rather than read off the GPS chip's own course field.
  const derivedHeadingRef = useRef(0);
  const prevLatLngForHeadingRef = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!currentLatLng) return;
    const prev = prevLatLngForHeadingRef.current;
    prevLatLngForHeadingRef.current = currentLatLng;
    if (!prev) return;
    const movedMeters =
      distanceKm(prev.latitude, prev.longitude, currentLatLng.latitude, currentLatLng.longitude) * 1000;
    // Skip tiny/noisy movement (GPS jitter while stationary or barely moving) -- recomputing a
    // bearing from a couple of meters of noise would make the arrow/camera spin erratically
    // instead of just holding the last known real direction of travel, which is what every real
    // nav app does while stopped at a light or in traffic.
    if (movedMeters < 3) return;
    derivedHeadingRef.current = bearingDegrees(
      prev.latitude,
      prev.longitude,
      currentLatLng.latitude,
      currentLatLng.longitude
    );
  }, [currentLatLng]);

  const heading =
    location?.coords.heading != null && location.coords.heading >= 0
      ? location.coords.heading
      : derivedHeadingRef.current;

  // Guards the very first tick after a route starts so the fitToCoordinates overview (below,
  // in onDestinationSelected) gets a moment on screen before the camera snaps into the tilted
  // close-follow -- same "show the whole route, then follow" beat Apple Maps uses.
  const navStartedAtRef = useRef(0);

  useEffect(() => {
    // Also skips while vehicle detection is open -- see detectionOpen's own effect-gating
    // comment further below for why: the MapView is fully covered by that modal and this
    // native camera animation has zero visible effect while hidden, but still costs real,
    // continuous native work stacked directly on top of vehicle detection's own tfjs
    // inference + camera capture loop, a genuine, confirmed contributor to detection
    // crashing/black-screening when opened mid-navigation.
    if (!route || !followTilt || !currentLatLng || detectionOpen) return;
    if (Date.now() - navStartedAtRef.current < 1200) return;
    // Deliberately omits pitch/zoom here (animateCamera only touches the fields it's given,
    // leaving the rest alone) -- GPS updates land every ~2s or every 5m travelled, which while
    // actually driving can be several times a second. Including a fixed pitch/zoom on every one
    // of those ticks was re-snapping the camera back and fighting a user's manual two-finger
    // tilt/pinch almost as soon as they started it, making that real, native gesture feel
    // broken even though it works fine on its own. Pitch/zoom are only ever set once, when
    // follow-tilt is first entered (toggleFollowTilt/enterOverviewMode below) -- after that, only
    // center/heading keep tracking live position/direction of travel.
    mapRef.current?.animateCamera({ center: currentLatLng, heading }, { duration: 600 });
  }, [route, followTilt, currentLatLng, heading, detectionOpen]);

  // Actually applies the "tilted, zoomed in" chase cam the comment above promises -- followTilt
  // defaulting to true was previously the *only* thing that happened on nav start; the per-tick
  // effect above deliberately never sets pitch/zoom (by design, so it doesn't fight a manual
  // tilt gesture), and no other code path ever applied one either. Tracks whether it's already
  // been applied for the *current* follow-tilt session via a ref flag, reset whenever
  // route/followTilt changes (below) -- rather than the previous one-shot setTimeout, which
  // fired exactly once at a fixed moment and, if no GPS fix existed yet at that exact instant
  // (a real, confirmed race, not hypothetical), silently gave up for the rest of that navigation
  // session with no retry. This version instead just checks "already applied?" on every GPS
  // tick and, if not, tries again -- so it's naturally
  // retried on the very next real position fix instead of only ever getting one shot.
  const chaseCamAppliedRef = useRef(false);
  useEffect(() => {
    // Don't clobber enterOverviewMode's own "already handled, don't reapply the default chase
    // cam" flag -- it sets chaseCamAppliedRef itself right before this effect would otherwise
    // run on the same followTilt-becomes-true transition and immediately undo it.
    if (Date.now() - lineTapAtRef.current < 300) return;
    chaseCamAppliedRef.current = false;
  }, [route, followTilt]);

  useEffect(() => {
    // See the per-tick effect above for why detectionOpen also skips this -- the map is fully
    // hidden behind the vehicle-detection modal in that state, so there's nothing to gain from
    // animating its camera, only real native work stacked on top of an already CPU/memory-heavy
    // screen.
    if (!route || !followTilt || detectionOpen) return;
    if (chaseCamAppliedRef.current) return;
    if (!currentLatLng) return;
    // enterOverviewMode (tap the route line) sets chaseCamAppliedRef itself and applies its own
    // pulled-back camera -- this only ever needs to handle the "just started/resumed following"
    // case, not the "user tapped the line" one.
    if (Date.now() - navStartedAtRef.current < 1200) return;
    chaseCamAppliedRef.current = true;
    mapRef.current?.animateCamera({ center: currentLatLng, heading, pitch: 60, zoom: 18 }, { duration: 700 });
  }, [route, followTilt, detectionOpen, currentLatLng, heading]);

  const toggleFollowTilt = useCallback(() => {
    setFollowTilt((was) => {
      const next = !was;
      if (!next && currentLatLng) {
        // A bit closer than the old zoom 15 -- "keep it lower, not too high" -- 15 read as too
        // zoomed-out/distant for a normal driving view once the tilted close-follow (zoom 18)
        // was the point of comparison.
        mapRef.current?.animateCamera(
          { center: currentLatLng, heading: 0, pitch: 0, zoom: 17 },
          { duration: 500 }
        );
      }
      return next;
    });
  }, [currentLatLng]);

  // General-purpose "snap back to my location" -- unlike the nav-only Recenter pill above
  // (only ever rendered once route && !followTilt), this is meant to be on screen at all times,
  // browsing the map with no destination picked included, so panning/zooming away always has a
  // way back. While actively navigating it just resumes the existing chase-cam follow instead
  // of animating the camera itself, so it doesn't fight/duplicate that effect's own camera work.
  const onRecenter = useCallback(() => {
    if (!currentLatLng) return;
    if (route) {
      if (!followTilt) toggleFollowTilt();
      return;
    }
    mapRef.current?.animateCamera({ center: currentLatLng }, { duration: 500 });
  }, [currentLatLng, route, followTilt, toggleFollowTilt]);

  // Tapping the route line pulls the camera back into a wider, still-tilted "overview" --
  // Apple/Google Maps' own convention when you tap the route during nav: not the tight
  // chase-cam (that's what the small toggle button gives you), but a pulled-back 3D view that
  // shows the surrounding blocks/buildings around your position, not just the next turn. Sets
  // followTilt=true so the same exit ("X") control in topRightControls works to back out of it.
  const lineTapAtRef = useRef(0);
  const enterOverviewMode = useCallback(() => {
    lineTapAtRef.current = Date.now();
    // Marks the chase-cam as "already handled" for this follow-tilt session so the default
    // chase-cam effect doesn't try to reapply its own pitch/zoom over this pulled-back view on
    // the very next GPS tick -- this call sets the camera explicitly right below.
    chaseCamAppliedRef.current = true;
    setFollowTilt(true);
    if (currentLatLng) {
      mapRef.current?.animateCamera(
        { center: currentLatLng, heading, pitch: 45, zoom: 15 },
        { duration: 500 }
      );
    }
  }, [currentLatLng, heading]);

  // Apple/Google Maps' own convention: a manual pan/tilt/rotate gesture drops the camera out of
  // auto-follow instead of being fought by it. Without this, the close-follow effect above
  // re-animates the camera back to its fixed pitch/zoom on every single GPS update (often under
  // a second apart) -- which stomps a two-finger tilt gesture almost as soon as the user starts
  // it, making manual 3D tilting feel broken even though the gesture itself works fine.
  const onMapPanDrag = useCallback(() => {
    if (followTilt) setFollowTilt(false);
  }, [followTilt]);

  // Subscribe to nearby alerts (Phase 3 + Phase 5) whenever position or radius changes
  // meaningfully. Fully off (and cleared) when the user has disabled alerts altogether --
  // "if toggled off user who is active doesn't receive no alerts".
  useEffect(() => {
    if (!currentLatLng || !user || !settings.alertsEnabled) {
      setNearbyAlerts([]);
      return;
    }
    const unsubscribe = subscribeNearbyAlerts(
      currentLatLng.latitude,
      currentLatLng.longitude,
      settings.alertRadiusKm,
      user.uid,
      setNearbyAlerts
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.uid,
    settings.alertsEnabled,
    settings.alertRadiusKm,
    currentLatLng ? Math.round(currentLatLng.latitude * 200) : null,
    currentLatLng ? Math.round(currentLatLng.longitude * 200) : null,
  ]);

  // Per-type visibility filter, applied on top of the radius subscription above -- lets a
  // driver e.g. only care about police + hazards without changing what's actually fetched.
  const visibleAlerts = useMemo(
    () => nearbyAlerts.filter((alert) => settings.visibleAlertTypes.includes(alert.type)),
    [nearbyAlerts, settings.visibleAlertTypes]
  );

  // Turn-by-turn voice guidance (Phase 2): advance the active step as GPS crosses trigger radius.
  useEffect(() => {
    if (!route || !currentLatLng) return;
    const { stepToSpeak, activeStepIndex: nextIndex } = evaluateGuidance(
      guidanceRef.current,
      route.steps,
      currentLatLng.latitude,
      currentLatLng.longitude
    );
    if (nextIndex !== activeStepIndex) setActiveStepIndex(nextIndex);
    if (stepToSpeak && voiceEnabled) {
      speak(stepToSpeak.instruction, voiceVolume);
    }
  }, [currentLatLng, route, voiceEnabled, voiceVolume, activeStepIndex]);

  // EV Radar (Phase 6): start/stop siren detection with the map screen lifecycle -- mount-once
  // (deps: []), NOT re-keyed on location. It used to also depend on currentLatLng/user/
  // autoShareDetections, which meant the entire on-device audio ML pipeline (mic permission,
  // model load, audio session, recorder) got torn down and rebuilt from scratch on every GPS
  // update -- several times a minute while driving. Reads to those values only ever happen
  // inside the onDetection callback, which is why refs (updated every render, not causing a
  // re-run) are enough here -- there's no need for the effect itself to see fresh values.
  const currentLatLngRef = useRef(currentLatLng);
  currentLatLngRef.current = currentLatLng;
  const userRef = useRef(user);
  userRef.current = user;
  const autoShareDetectionsRef = useRef(settings.autoShareDetections);
  autoShareDetectionsRef.current = settings.autoShareDetections;

  useEffect(() => {
    sirenDetection.start();

    const unsubscribe = sirenDetection.onDetection(async ({ label }) => {
      setBannerMessage("Emergency vehicle detected nearby");
      setBannerVisible(true);

      const latLng = currentLatLngRef.current;
      const currentUser = userRef.current;
      if (autoShareDetectionsRef.current && latLng && currentUser) {
        try {
          await reportAlert("emergency_vehicle", latLng, currentUser.uid);
        } catch (err) {
          console.warn("[siren] auto-share detection failed", err);
        }
      }
    });

    return () => {
      unsubscribe();
      sirenDetection.stop();
    };
  }, []);

  // Sensitivity is the one siren setting that genuinely should apply immediately without a
  // full restart -- kept as its own small effect, separate from the mount-once one above.
  useEffect(() => {
    sirenDetection.setSensitivity(settings.sirenSensitivity);
  }, [settings.sirenSensitivity]);

  // `mode` is always passed explicitly by every call site (never defaulted/read off the
  // `travelMode` closure) -- onSelectTravelMode below needs to fetch for the *new* mode the
  // instant it's picked, before the setTravelMode state update has actually landed, so passing
  // it as a plain argument sidesteps any stale-closure risk entirely.
  const fetchRouteOptions = useCallback(
    async (destination: LatLng, waypoint: LatLng | undefined, mode: TravelMode) => {
      if (!currentLatLng) return;
      setLoadingRouteOptions(true);
      setRouteOptionsError(null);
      try {
        if (mode === "driving") {
          const options = await getRouteOptions(currentLatLng, destination, waypoint);
          setRouteOptions(options);
          setModeRoute(null);
          setSelectedProfile("normal");
          mapRef.current?.fitToCoordinates(options.normal.polyline, {
            edgePadding: { top: 120, right: 60, bottom: routeCardHeight + spacing.md, left: 60 },
            animated: true,
          });
        } else {
          // Walking/bicycling/transit: one real route from Google for that mode, not a
          // driving-route estimate scaled by some guessed speed factor -- genuine distance and
          // duration for how that mode actually gets there, transit included (Google's transit
          // directions factor in real published timetables, not just travel speed).
          const modeResult = await getDirectionsForMode(currentLatLng, destination, mode, waypoint);
          setModeRoute(modeResult);
          setRouteOptions(null);
          mapRef.current?.fitToCoordinates(modeResult.polyline, {
            edgePadding: { top: 120, right: 60, bottom: routeCardHeight + spacing.md, left: 60 },
            animated: true,
          });
        }
      } catch (err) {
        Sentry.logger.error("map: failed to fetch route options", { error: String(err), mode });
        console.warn("[map] failed to fetch route options", err);
        // Same underlying cause as the destination search billing check below -- the
        // Directions API call hits the exact same Google Cloud project/key, so it fails the
        // same way whenever billing isn't enabled there.
        setRouteOptionsError(
          err instanceof DirectionsApiError
            ? /billing/i.test(err.message)
              ? "Routing unavailable -- billing isn't enabled on this app's Google Cloud project"
              : `Couldn't find a route (${err.status})`
            : "Couldn't find a route -- check your connection"
        );
      } finally {
        setLoadingRouteOptions(false);
      }
    },
    [currentLatLng, routeCardHeight]
  );

  // Min zoom before the OSM layer *re-fetches* -- a zoomed-out view spans too wide an area for
  // a reasonable Overpass request/response size. ~0.03 latitudeDelta is roughly a few-km-wide
  // view, comparable to web's OSM_LAYER_MIN_ZOOM. Zooming out past this only skips asking for
  // *new* data -- it must NOT clear osmData, or a toggled-on layer visibly disappears the
  // moment you zoom out, which is exactly the bug reported ("zooming out the traffic lights or
  // speed cameras... disappears"). Whatever was already fetched for the last in-range view
  // stays on screen; it only gets replaced once the user zooms back in and pans to a new area.
  const OSM_LAYER_MAX_DELTA = 0.03;

  // Loads traffic-light/speed-camera markers around the user's own position the moment a GPS
  // fix exists and either layer is toggled on -- independent of the map ever panning or
  // zooming. Previously the *only* trigger for a fetch was onRegionChangeComplete below, which
  // needs both an actual region-change event AND a region already narrower than
  // OSM_LAYER_MAX_DELTA to fire -- but the map's own initialRegion starts at a 0.05 delta,
  // wider than that threshold, so a fresh app launch (or a toggle flipped on mid-session) left
  // both layers invisible until the user manually zoomed in, even with the setting already on.
  // Reset to false whenever both layers are off, so turning either back on fires this again.
  const osmInitialLoadRef = useRef(false);
  useEffect(() => {
    if (!settings.showTrafficLights && !settings.showSpeedCameras) {
      osmInitialLoadRef.current = false;
      return;
    }
    if (osmInitialLoadRef.current || !currentLatLng) return;
    osmInitialLoadRef.current = true;
    const delta = 0.015;
    const bounds = {
      sw: {
        latitude: currentLatLng.latitude - delta / 2,
        longitude: currentLatLng.longitude - delta / 2,
      },
      ne: {
        latitude: currentLatLng.latitude + delta / 2,
        longitude: currentLatLng.longitude + delta / 2,
      },
    };
    setOsmLoading(true);
    fetchOsmTrafficData(bounds, {
      wantTrafficLights: settings.showTrafficLights,
      wantSpeedCameras: settings.showSpeedCameras,
    })
      .then(setOsmData)
      .catch((err) => console.warn("[map] initial OSM traffic layer fetch failed", err))
      .finally(() => setOsmLoading(false));
  }, [currentLatLng, settings.showTrafficLights, settings.showSpeedCameras]);

  const onRegionChangeComplete = useCallback(
    (region: Region, details?: { isGesture?: boolean }) => {
      // onPanDrag (see onMapPanDrag above) only fires for an actual translating drag -- a pure
      // two-finger twist-to-rotate or two-finger tilt, held in place with no panning, never
      // triggers it, so followTilt stayed true and the next GPS tick's chase-cam update
      // silently snapped heading back to GPS course almost immediately, making a manual rotate
      // feel like it "didn't take" or needed to be held to fight the snap-back. Google Maps'
      // native layer reports isGesture: true for *any* user-touch-driven camera change
      // (pan, pinch, rotate, tilt alike) as opposed to this app's own animateCamera calls, so
      // this catches the rotate-only case onPanDrag misses.
      if (details?.isGesture && followTilt) setFollowTilt(false);

      // Manual alert placement uses a fixed pin at the center of the screen and moves the map
      // underneath it instead of a draggable Marker (see onAlertTypeSelected above) -- so the
      // "drag" is really just keeping alertPlacementLatLng in sync with wherever the map
      // settles after every pan/pinch-zoom gesture.
      if (placingAlert) {
        setAlertPlacementLatLng({ latitude: region.latitude, longitude: region.longitude });
      }

      if (osmDebounceRef.current) clearTimeout(osmDebounceRef.current);
      if (!settings.showTrafficLights && !settings.showSpeedCameras) {
        setOsmData(null);
        setOsmLoading(false);
        return;
      }
      if (region.latitudeDelta > OSM_LAYER_MAX_DELTA) {
        setOsmLoading(false);
        return;
      }
      osmDebounceRef.current = setTimeout(() => {
        const bounds = {
          sw: {
            latitude: region.latitude - region.latitudeDelta / 2,
            longitude: region.longitude - region.longitudeDelta / 2,
          },
          ne: {
            latitude: region.latitude + region.latitudeDelta / 2,
            longitude: region.longitude + region.longitudeDelta / 2,
          },
        };
        setOsmLoading(true);
        fetchOsmTrafficData(bounds, {
          wantTrafficLights: settings.showTrafficLights,
          wantSpeedCameras: settings.showSpeedCameras,
        })
          .then(setOsmData)
          .catch((err) => console.warn("[map] OSM traffic layer fetch failed", err))
          .finally(() => setOsmLoading(false));
      }, 1200);
    },
    [placingAlert, settings.showTrafficLights, settings.showSpeedCameras, followTilt]
  );

  const onMapPress = useCallback(
    (e: MapPressEvent) => {
      // Don't hijack a tap that's meant for something else already in progress -- placing an
      // alert pin, or a sheet already open and eating input.
      if (placingAlert || anySheetOpen) return;
      // react-native-maps fires the map's own onPress *in addition to* a tapped polyline's
      // onPress on the same tap (confirmed in the native iOS handler), not instead of it -- so
      // tapping the route line would otherwise also kick off a Places lookup for whatever's
      // directly under that point at the same time as entering overview mode. Short-lived guard
      // so a just-handled line tap doesn't double-fire this.
      if (Date.now() - lineTapAtRef.current < 150) return;
      const coordinate = e.nativeEvent.coordinate;
      setPlaceInfoLoading(true);
      findNearestPlace(coordinate)
        .then((nearest) => {
          if (!nearest) return null;
          return getPlaceInfo(nearest.placeId);
        })
        .then((info) => {
          if (!info) return;
          // rankby=distance (see findNearestPlace) can still legitimately return a real
          // business that's genuinely far from an empty tap (e.g. tapping open water or a
          // park with no nearby POIs at all) -- Nearby Search has no radius bound in that
          // mode. A sanity distance check here means a tap with nothing actually close by
          // shows no sheet at all instead of confidently attaching an unrelated business to
          // wherever was tapped.
          const distMeters = distanceKm(
            coordinate.latitude,
            coordinate.longitude,
            info.location.latitude,
            info.location.longitude
          ) * 1000;
          if (distMeters > MAX_POI_TAP_DISTANCE_METERS) return;
          setPlaceInfo(info);
          placeInfoSheetRef.current?.expand();
        })
        .catch((err) => {
          console.warn("[map] place info lookup failed", err);
          Sentry.logger.error("map: place info lookup failed", { error: String(err) });
        })
        .finally(() => setPlaceInfoLoading(false));
    },
    [placingAlert, anySheetOpen]
  );

  const onDestinationSelected = useCallback(
    (place: PlaceDetails) => {
      if (!currentLatLng) return;
      setPendingDestination(place);
      setStopLocation(null);
      // A fresh destination pick always starts from Drive -- predictable default, matches how
      // the picker looked before travel modes existed.
      setTravelMode("driving");
      fetchRouteOptions(place.location, undefined, "driving");
    },
    [currentLatLng, fetchRouteOptions]
  );

  const onStopSelected = useCallback(
    (place: PlaceDetails) => {
      if (!pendingDestination) return;
      setStopLocation(place.location);
      setPickingStop(false);
      fetchRouteOptions(pendingDestination.location, place.location, travelMode);
    },
    [pendingDestination, fetchRouteOptions, travelMode]
  );

  const onSelectTravelMode = useCallback(
    (mode: TravelMode) => {
      setTravelMode(mode);
      if (pendingDestination) {
        fetchRouteOptions(pendingDestination.location, stopLocation ?? undefined, mode);
      }
    },
    [pendingDestination, stopLocation, fetchRouteOptions]
  );

  const onSelectProfile = useCallback(
    (key: RouteProfileKey) => {
      setSelectedProfile(key);
      const previewRoute = routeOptions?.[key];
      if (previewRoute) {
        mapRef.current?.fitToCoordinates(previewRoute.polyline, {
          edgePadding: { top: 120, right: 60, bottom: routeCardHeight + spacing.md, left: 60 },
          animated: true,
        });
      }
    },
    [routeOptions, routeCardHeight]
  );

  const confirmRoute = useCallback(() => {
    const chosen = travelMode === "driving" ? routeOptions?.[selectedProfile] : modeRoute;
    if (!chosen || !pendingDestination) return;
    guidanceRef.current = createGuidanceState();
    setActiveStepIndex(0);
    setRoute(chosen);
    setDestinationLatLng(pendingDestination.location);
    navStartedAtRef.current = Date.now();
    setFollowTilt(true);
    mapRef.current?.fitToCoordinates(chosen.polyline, {
      edgePadding: { top: 120, right: 60, bottom: 120, left: 60 },
      animated: true,
    });
    setRouteOptions(null);
    setModeRoute(null);
    setPendingDestination(null);
  }, [routeOptions, modeRoute, travelMode, selectedProfile, pendingDestination]);

  const cancelRouteOptions = useCallback(() => {
    setRouteOptions(null);
    setModeRoute(null);
    setPendingDestination(null);
    setStopLocation(null);
    setPickingStop(false);
    setRouteOptionsError(null);
    setTravelMode("driving");
  }, []);

  const exitNavigation = useCallback(() => {
    stopSpeaking();
    setRoute(null);
    setActiveStepIndex(0);
    setFollowTilt(true);
    setStopLocation(null);
    setDestinationLatLng(null);
  }, []);

  // Flow (per spec: select the type first, then drag to place, then Set/Save):
  // 1. FAB -> openAlertTypePicker: opens AlertReportSheet, nothing else happens yet.
  // 2. onAlertTypeSelected: sheet closes, placement mode starts (type remembered in a ref for
  //    the eventual save).
  // 3. confirmAlertPlacement ("Set"): actually writes the alert at wherever the pin ended up.
  // 4. cancelAlertPlacement ("Cancel"): aborts, no write.
  //
  // The pin itself is NOT a draggable Marker -- react-native-maps' per-marker drag gesture
  // recognizer on iOS reliably loses to (or gets left in a broken state by) the map's own
  // pinch-zoom recognizer: real user report was "doesn't allow to drag the pin for any alert
  // ... with zoom out with fingers and re-drag". Instead this uses the same fixed
  // center-of-screen pin + drag-the-map-underneath-it pattern Uber/Google Maps' own "choose a
  // location" flows use -- panning/zooming the map is the map's native, always-reliable
  // gesture, so there's no competing recognizer to lose to. alertPlacementLatLng is just kept
  // in sync with the map's own region center (see onRegionChangeComplete below) while
  // placingAlert is true; the pin view itself never moves, the map moves under it.
  const pendingAlertTypeRef = useRef<AlertType | null>(null);

  const openAlertTypePicker = useCallback(() => {
    reportSheetRef.current?.expand();
  }, []);

  const onAlertTypeSelected = useCallback(
    (type: AlertType) => {
      if (!currentLatLng) return;
      pendingAlertTypeRef.current = type;
      reportSheetRef.current?.close();
      setAlertPlacementLatLng(currentLatLng);
      setPlacingAlert(true);
      // Snap the map to center on the current location so the fixed center pin starts exactly
      // where alertPlacementLatLng says it is, even if the user had panned away beforehand.
      mapRef.current?.animateToRegion(
        { ...currentLatLng, latitudeDelta: 0.006, longitudeDelta: 0.006 },
        300
      );
    },
    [currentLatLng]
  );

  const confirmAlertPlacement = useCallback(async () => {
    const type = pendingAlertTypeRef.current;
    const location = alertPlacementLatLng;
    if (!type || !location || !user) return;
    await reportAlert(type, location, user.uid);
    pendingAlertTypeRef.current = null;
    setPlacingAlert(false);
    setAlertPlacementLatLng(null);
  }, [alertPlacementLatLng, user]);

  const cancelAlertPlacement = useCallback(() => {
    pendingAlertTypeRef.current = null;
    setPlacingAlert(false);
    setAlertPlacementLatLng(null);
  }, []);

  const onMarkerPress = useCallback((alert: AlertDoc) => {
    setSelectedAlert(alert);
    detailSheetRef.current?.expand();
  }, []);

  const onDeleteAlert = useCallback(async (alert: AlertDoc) => {
    await deleteAlert(alert.id);
    detailSheetRef.current?.close();
  }, []);

  const onHideAlert = useCallback(async (alert: AlertDoc) => {
    if (!user) return;
    await hideAlertForUser(alert.id, user.uid);
    detailSheetRef.current?.close();
  }, [user]);

  const onConfirmStillHere = useCallback(async (alert: AlertDoc) => {
    await confirmAlert(alert.id);
  }, []);

  const activeStep = route?.steps[activeStepIndex] ?? null;
  const remainingDistanceMeters = useMemo(
    () => (route ? route.steps.slice(activeStepIndex).reduce((sum, s) => sum + s.distanceMeters, 0) : 0),
    [route, activeStepIndex]
  );
  const remainingDurationSeconds = useMemo(
    () => (route ? route.steps.slice(activeStepIndex).reduce((sum, s) => sum + s.durationSeconds, 0) : 0),
    [route, activeStepIndex]
  );
  const arrivalClockText = useMemo(
    () => (route ? formatArrivalClock(Date.now() + remainingDurationSeconds * 1000) : ""),
    [route, remainingDurationSeconds]
  );

  // One-time snapshot, not a live-updating tracked link -- matches the web app's own
  // shareEta: a plain-text message with the current ETA/arrival time and a static Google
  // Maps link to where the sender is right now, handed off to the OS share sheet.
  const shareEta = useCallback(async () => {
    if (!route || !currentLatLng) return;
    const mapsLink = `https://www.google.com/maps?q=${currentLatLng.latitude},${currentLatLng.longitude}`;
    const message =
      `I'm on my way -- ETA ${route.etaText}, arriving around ${arrivalClockText}. ` +
      `My current location: ${mapsLink}`;
    try {
      await Share.share({ message });
    } catch (err) {
      Sentry.logger.error("map: share ETA failed", { error: String(err) });
      console.warn("[map] share ETA failed", err);
    }
  }, [route, currentLatLng, arrivalClockText]);

  return (
    <View style={styles.container}>
      {/* Everything map-related lives in its own flex:1 area so the banner ad below gets a
          real reserved row of its own instead of floating over the map -- it can never
          overlap the route, turn instructions, or FAB buttons this way. */}
      <View style={styles.mapArea}>
      {/* DIAGNOSTIC BUILD -- native MapView swapped for a plain placeholder View. Sentry
          native, the entire ad SDK, AsyncStorage, and now expo-location's watch (see
          LocationContext.tsx's DIAGNOSTIC_DISABLE_LOCATION_WATCH) are all off in this same
          build. MapView is the one remaining unconditional-on-launch native surface that's
          never been isolated -- it mounts on every cold launch with zero gating, same as the
          subsystems already ruled out. If the crash disappears with this out too, MapView (or
          its provider config/customMapStyle) is confirmed; if it persists, every native
          surface examined so far is ruled out and the search moves to something not yet
          identified, with real evidence either way. */}
      {DIAGNOSTIC_DISABLE_MAPVIEW ? (
        <View style={[StyleSheet.absoluteFill, styles.mapPlaceholder]} />
      ) : (
      // Google provider on every platform, iOS included. iOS defaulting to Apple's native
      // MapKit (provider left unset) used to be deliberate here, reasoned as "Google needs a
      // custom dev client on iOS, unavailable in Expo Go" -- true for Expo Go, but this app is
      // never run in Expo Go; it's always a real EAS-built binary, so that caveat never actually
      // applied to it. The real, confirmed cost of leaving iOS on Apple Maps: customMapStyle
      // (the map color theme picker in Settings) is a silent no-op on Apple's native renderer --
      // it has no equivalent JSON styling mechanism at all, so every theme *looked* identical
      // (Apple's own fixed light/dark palette) regardless of which one was selected. The
      // react-native-maps Google config plugin + a real GOOGLE_MAPS_IOS_API_KEY (confirmed set
      // in EAS's production env) are already wired in app.config.js, so this is switching on
      // infrastructure that was already fully built, not adding new native surface from
      // scratch.
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        mapType={mapType}
        // The custom theme style only ever applies to the "standard" map type -- satellite/
        // hybrid imagery has no styleable roads/land polygons to restyle, so Google/Apple just
        // ignore it there. Safe to always pass. Theme picked in Settings (see mapStyle.ts).
        customMapStyle={MAP_THEME_STYLES[settings.mapTheme]}
        style={StyleSheet.absoluteFill}
        // The default blue-dot puck is swapped for a custom heading-rotated arrow (below)
        // while actively navigating -- a plain dot doesn't communicate which way you're
        // facing, which matters once the camera itself is also rotating to match heading.
        // Reverts to the normal dot the instant navigation ends (route becomes null).
        showsUserLocation={!route}
        showsMyLocationButton={false}
        // Explicit rather than relying on the library default -- two-finger twist-to-rotate
        // and two-finger drag-to-tilt are both genuinely native MapView gestures, not something
        // this app has to implement by hand.
        rotateEnabled
        pitchEnabled
        // `initialRegion` is a mount-time-only prop -- react-native-maps never re-reads it once
        // the map has rendered once. A real GPS fix normally takes a second or two after
        // launch/permission-grant to arrive, so this coordinate (San Francisco -- an arbitrary
        // engineering placeholder, not meant to mean anything) briefly shows before the very
        // next effect below corrects it to the real position the instant one exists. This used
        // to have no such correction at all -- if the first fix hadn't landed yet at the exact
        // moment this mounted, the map just silently stayed on this placeholder forever, which
        // is exactly the confirmed "why is it showing San Francisco, I'm in Sydney" bug.
        initialRegion={{
          latitude: currentLatLng?.latitude ?? 37.7749,
          longitude: currentLatLng?.longitude ?? -122.4194,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onMapPress}
        onPanDrag={onMapPanDrag}
      >
        {route && (
          <Polyline
            coordinates={route.polyline}
            strokeWidth={8}
            strokeColor="#2563EB"
            tappable
            onPress={enterOverviewMode}
          />
        )}
        {/* Custom heading-rotated arrow puck, replacing the default blue dot (showsUserLocation
            is false above while route is set) -- flat+rotation is react-native-maps' own
            built-in support for a marker that rotates with heading instead of always facing
            the camera, exactly the "connected to the route/direction of travel" arrow. */}
        {route && currentLatLng && (
          <Marker coordinate={currentLatLng} anchor={{ x: 0.5, y: 0.5 }} flat rotation={heading} tracksViewChanges={false}>
            <View style={styles.navArrowWrap}>
              <Ionicons name="navigate" size={20} color="#FFFFFF" />
            </View>
          </Marker>
        )}
        {/* Preview of whichever route profile is highlighted in the picker below, before
            the user commits to it with Start -- "click a route, see its line" like Apple/
            Google Maps' own route picker. Red (not the same blue as the committed route below,
            or the destination halo) so it stays visible against every map theme -- the old
            blue preview was the exact same shade as several themes' own road color (e.g. Blue
            & Grey), making it functionally invisible on top of a same-colored street. Dashed on
            top of that so it's still visually distinct from the solid committed-route line
            (the two are mutually exclusive: `route` is only ever set once routeOptions has been
            cleared by confirmRoute). */}
        {routeOptions && (
          <Polyline
            coordinates={routeOptions[selectedProfile].polyline}
            strokeWidth={5}
            strokeColor="#DC2626"
            lineDashPattern={[8, 6]}
          />
        )}
        {/* Highlighted arrival spot -- the exact picked destination (not wherever the
            polyline decoder's last point happens to land), so it's obvious exactly which
            building/driveway is the actual arrival point rather than "somewhere on this
            block". A soft halo ring plus a pin on top, both anchored to the same coordinate. */}
        {destinationLatLng && (
          <>
            <Circle
              center={destinationLatLng}
              radius={18}
              strokeWidth={2}
              strokeColor="rgba(37, 99, 235, 0.9)"
              fillColor="rgba(37, 99, 235, 0.18)"
            />
            <Marker coordinate={destinationLatLng} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
              <View style={styles.destinationPinWrap}>
                <Ionicons name="location" size={40} color={colors.accent} />
              </View>
            </Marker>
          </>
        )}
        {visibleAlerts.map((alert) => (
          <AlertMarker key={alert.id} alert={alert} onPress={onMarkerPress} />
        ))}
        {settings.showTrafficLights &&
          osmData?.trafficLights.map((p) => (
            <Marker
              key={`tl-${p.id}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={(e) => {
                e.stopPropagation();
                onOsmMarkerPress("traffic_light", { latitude: p.lat, longitude: p.lng });
              }}
            >
              <View style={styles.osmIconBadgeTrafficLight}>
                <MaterialCommunityIcons name="traffic-light" size={11} color="#FFFFFF" />
              </View>
            </Marker>
          ))}
        {settings.showSpeedCameras &&
          osmData?.speedCameras.map((p) => (
            <Marker
              key={`sc-${p.id}`}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={(e) => {
                e.stopPropagation();
                onOsmMarkerPress("speed_camera", { latitude: p.lat, longitude: p.lng });
              }}
            >
              <View style={styles.osmIconBadgeSpeedCamera}>
                <MaterialCommunityIcons name="cctv" size={11} color="#FFFFFF" />
              </View>
            </Marker>
          ))}
      </MapView>
      )}

      {/* Fixed center-of-screen pin for manual alert placement -- see the comment on
          onAlertTypeSelected/onRegionChangeComplete above for why this replaced a draggable
          Marker. Never moves itself; the map pans/zooms underneath it instead. */}
      {placingAlert && (
        <View style={styles.placementPinOverlay} pointerEvents="none">
          <Ionicons name="location" size={44} color={colors.danger} />
        </View>
      )}

      {show3D && isMap3DSupported && currentLatLng && (
        <>
          <Map3DView
            ref={map3DRef}
            style={StyleSheet.absoluteFill}
            center={currentLatLng}
            markerPosition={currentLatLng}
            routeCoordinates={route?.polyline}
          />
          <Pressable
            style={({ pressed }) => [
              styles.frontViewButton,
              { top: insets.top + spacing.md },
              frontView && styles.fabActive,
              pressed && { opacity: pressedOpacity },
            ]}
            onPress={toggleFrontView}
            accessibilityLabel={frontView ? "Switch to top-down 3D view" : "Switch to front view"}
          >
            <Ionicons name={frontView ? "layers" : "eye"} size={18} color="#FFFFFF" />
            <Text style={styles.frontViewButtonText}>{frontView ? "Top-down" : "Front view"}</Text>
          </Pressable>
        </>
      )}

      {!route && !pendingDestination && !placingAlert && (
        <DestinationSearchBar biasLocation={currentLatLng ?? undefined} onDestinationSelected={onDestinationSelected} />
      )}

      {!route && pendingDestination && pickingStop && (
        <DestinationSearchBar
          biasLocation={currentLatLng ?? undefined}
          onDestinationSelected={onStopSelected}
          placeholder="Add a stop on the way"
          onCancel={() => setPickingStop(false)}
        />
      )}

      {!route && pendingDestination && !pickingStop && (
        <RouteOptionsCard
          options={routeOptions}
          modeRoute={modeRoute}
          travelMode={travelMode}
          onSelectTravelMode={onSelectTravelMode}
          loading={loadingRouteOptions}
          errorText={routeOptionsError}
          selected={selectedProfile}
          onSelect={onSelectProfile}
          onStart={confirmRoute}
          onCancel={cancelRouteOptions}
          onAddStop={() => setPickingStop(true)}
          hasStop={!!stopLocation}
          onHeightChange={setRouteCardHeight}
        />
      )}

      {route && (
        <NavigationInstructionCard
          step={activeStep}
          etaText={route.etaText}
          arrivalClockText={arrivalClockText}
          distanceRemainingText={`${(remainingDistanceMeters / 1000).toFixed(1)} km`}
          onExit={exitNavigation}
          onShareEta={shareEta}
          onExpandDirections={() => directionsSheetRef.current?.expand()}
          onHeightChange={setInstructionCardHeight}
        />
      )}

      {/* Pushed below the instruction card while navigating (instead of sharing its top
          offset) so it never overlaps the turn text -- it used to sit at the same `top` as
          the full-width card and render on top of its right edge. This used to be a fixed
          "+96" guess, but the card's real height varies with how many lines the instruction/
          meta text wrap to (a long instruction like "At the roundabout, take the 1st exit onto
          Noble Ave..." wraps taller than a short one) -- a guess that undershot the real height
          meant this whole button column, mute included, could end up partly behind the card,
          which is exactly what made the volume button intermittently miss taps depending on
          which instruction happened to be showing. instructionCardHeight (measured via the
          card's own onLayout) replaces the guess with the real number; 96 only remains as the
          fallback for the one frame before the very first measurement lands. */}
      <View
        style={[
          styles.topRightControls,
          { top: insets.top + spacing.md + (route ? instructionCardHeight + spacing.md : 0) },
        ]}
      >
        {/* A real, clearly-labeled "Recenter" pill once the user has panned away (manual drag
            or exiting the 3D view both drop followTilt to false) -- previously this was always
            just a small icon-only circle, easy to miss/not recognize as "get my location back"
            versus the plain "X" that makes sense once already in the 3D view. */}
        {route && !followTilt && (
          <Pressable
            style={({ pressed }) => [styles.recenterPill, pressed && { opacity: pressedOpacity }]}
            onPress={toggleFollowTilt}
            hitSlop={8}
            accessibilityLabel="Recenter on my location"
          >
            <Ionicons name="navigate" size={16} color="#FFFFFF" />
            <Text style={styles.recenterPillText}>Recenter</Text>
          </Pressable>
        )}
        {route && followTilt && (
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && { opacity: pressedOpacity }]}
            onPress={toggleFollowTilt}
            hitSlop={8}
            accessibilityLabel="Exit close-follow view"
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        )}
        {/* Voice guidance only ever speaks during active turn-by-turn navigation, so mute
            only means anything then -- previously always rendered here, which put it at the
            exact same top offset as the destination search bar (both start at
            insets.top + spacing.md) and painted on top of the search bar's right edge
            whenever not navigating, looking like a broken "voice search" button glued to the
            search input instead of a separate control. */}
        {route && <MuteButton />}
        {/* Overpass (OSM) traffic-light/speed-camera lookups can genuinely take a few
            seconds -- a visible spinner while one is in flight replaces what used to look
            like the layer being permanently stuck with no feedback at all. */}
        {osmLoading && (settings.showTrafficLights || settings.showSpeedCameras) && (
          <View style={styles.osmLoadingBadge} accessibilityLabel="Loading traffic light and speed camera data">
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        )}
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("Settings")}
          hitSlop={8}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Hidden while a bottom sheet is open, an alert is being placed, or the route/stop
          picker card is up (pendingDestination) -- previously these stayed rendered at their
          normal position underneath whichever card was showing, and the FAB right above that
          card's top edge visibly collided with it (the satellite/camera buttons overlapping
          "Fastest"/"Safest" rows) instead of being cleanly covered or cleanly visible. */}
      {!anySheetOpen && !placingAlert && !pendingDestination && (
        <>
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 24 },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={openAlertTypePicker}
        accessibilityLabel="Report an alert"
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.fabSecondary,
          { bottom: insets.bottom + 24 + 70 },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={() => {
          Sentry.logger.info("map: opening vehicle detection screen");
          setDetectionOpen(true);
        }}
        accessibilityLabel="Live vehicle detection"
      >
        <Ionicons name="videocam" size={24} color="#FFFFFF" />
      </Pressable>

      {isMap3DSupported && (
        <Pressable
          style={({ pressed }) => [
            styles.fabSecondary,
            { bottom: insets.bottom + 24 + 140 },
            show3D && styles.fabActive,
            pressed && { opacity: pressedOpacity },
          ]}
          onPress={() =>
            setShow3D((v) => {
              Sentry.logger.info("map: toggling 3D view", { next: !v });
              return !v;
            })
          }
          accessibilityLabel={show3D ? "Switch to standard map" : "Switch to 3D satellite view"}
        >
          <Ionicons name="globe-outline" size={22} color="#FFFFFF" />
        </Pressable>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.fabSecondary,
          { bottom: insets.bottom + 24 + (isMap3DSupported ? 210 : 140) },
          mapType === "hybrid" && styles.fabActive,
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={() => setMapType((v) => (v === "standard" ? "hybrid" : "standard"))}
        accessibilityLabel={mapType === "hybrid" ? "Switch to standard map" : "Switch to satellite map"}
      >
        <Ionicons name="map-outline" size={22} color="#FFFFFF" />
      </Pressable>

      {/* Permanent recenter button -- always in this stack, on top of the satellite and "+"
          buttons below it, regardless of whether navigation is active. Previously the only
          recenter control was the nav-only pill up top (only ever rendered once
          route && !followTilt is true), so there was no way back to your own location at all
          while just browsing the map before picking a destination. */}
      <Pressable
        style={({ pressed }) => [
          styles.fabSecondary,
          { bottom: insets.bottom + 24 + (isMap3DSupported ? 280 : 210) },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={onRecenter}
        accessibilityLabel="Recenter on my location"
      >
        <Ionicons name="locate" size={22} color="#FFFFFF" />
      </Pressable>
        </>
      )}
      </View>

      {/* Never shown while navigating -- a driving app shouldn't have anything competing for
          attention with the road/turn instructions, safety concern first and foremost. */}
      {/* DIAGNOSTIC: disabled -- see App.tsx's DIAGNOSTIC_DISABLE_APP_OPEN_AD. BannerAd's own
          native `load` command (Commands.load in GoogleMobileAdsBannerViewNativeComponent.ts)
          is *also* a void-returning TurboModule call, the same crash-signature match as
          appOpenLoad, and it fires unconditionally the moment this mounts (every launch, since
          !route is true until navigation starts) -- this was never actually excluded by the
          build 24 AppOpenAdManager-only test, so that test wasn't a clean isolation of ads as
          a whole. Disabling this too for a real one. */}
      {!route && (
        <AdsErrorBoundary>
          <BannerAdBar />
        </AdsErrorBoundary>
      )}

      {placingAlert && (
        <View style={[styles.placementBar, { bottom: insets.bottom + spacing.xl }]}>
          <Text style={styles.placementBarText}>Move the map to place the pin</Text>
          <View style={styles.placementBarButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.placementButton,
                styles.placementButtonRemove,
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={cancelAlertPlacement}
              accessibilityLabel="Cancel placing alert"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.placementButton,
                styles.placementButtonSet,
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={confirmAlertPlacement}
              accessibilityLabel="Set alert location"
            >
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              <Text style={styles.placementButtonSetText}>Set</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Modal's own `visible` prop only controls whether the native modal is *presented* --
          it does NOT unmount its children when set to false. Rendering VehicleDetectionScreen
          unconditionally here meant tapping Close just hid the modal while the camera session,
          the capture interval, and every state update it drives kept running invisibly in the
          background -- which is exactly why Close looked like it "didn't work" and is a strong
          candidate for the reported crashes (a hidden/backgrounded camera continuing to fire
          native capture calls, especially colliding with a facing switch). Gating the child on
          `detectionOpen` too means Close now genuinely unmounts it -- camera session torn down,
          interval cleared, no work left running once the modal is gone. */}
      <Modal visible={detectionOpen} animationType="slide" onRequestClose={() => setDetectionOpen(false)}>
        {detectionOpen && (
          <VehicleDetectionErrorBoundary onClose={() => setDetectionOpen(false)}>
            <VehicleDetectionScreen onClose={() => setDetectionOpen(false)} isNavigating={!!route} />
          </VehicleDetectionErrorBoundary>
        )}
      </Modal>

      <AlertReportSheet
        ref={reportSheetRef}
        onTypeSelected={onAlertTypeSelected}
        onClose={() => reportSheetRef.current?.close()}
        onSheetChange={(index) => setReportSheetOpen(index >= 0)}
      />
      <AlertDetailSheet
        ref={detailSheetRef}
        alert={selectedAlert}
        currentUid={user?.uid ?? null}
        onDelete={onDeleteAlert}
        onHide={onHideAlert}
        onConfirmStillHere={onConfirmStillHere}
        onClose={() => detailSheetRef.current?.close()}
        onSheetChange={(index) => setDetailSheetOpen(index >= 0)}
      />
      <PlaceInfoSheet
        ref={placeInfoSheetRef}
        place={placeInfo}
        onClose={() => placeInfoSheetRef.current?.close()}
        onSheetChange={(index) => setPlaceInfoSheetOpen(index >= 0)}
      />
      <OsmMarkerSheet
        ref={osmMarkerSheetRef}
        kind={osmMarkerKind}
        location={osmMarkerLocation}
        onClose={() => osmMarkerSheetRef.current?.close()}
        onSheetChange={(index) => setOsmMarkerSheetOpen(index >= 0)}
      />
      <RouteDirectionsSheet
        ref={directionsSheetRef}
        route={route}
        activeStepIndex={activeStepIndex}
        onClose={() => directionsSheetRef.current?.close()}
        onSheetChange={(index) => setDirectionsSheetOpen(index >= 0)}
      />

      {placeInfoLoading && (
        <View style={styles.placeInfoLoadingBadge} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      )}

      {/* Rendered last so it always paints on top of the search bar/nav card below it,
          instead of being silently covered by them when both occupy the same top area. */}
      <AlertBanner
        visible={bannerVisible}
        message={bannerMessage}
        onDismiss={() => setBannerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted },
  mapArea: { flex: 1 },
  mapPlaceholder: { backgroundColor: colors.surfaceMuted },
  destinationPinWrap: {
    alignItems: "center",
    justifyContent: "center",
    ...shadow.medium,
  },
  navArrowWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.medium,
  },
  placementPinOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    // Icon is 44x44; offset so the pin's point (bottom-center of the glyph) lands exactly on
    // the map's screen-center coordinate, not the icon's own center.
    marginLeft: -22,
    marginTop: -44,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.high,
  },
  placementBar: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    ...shadow.high,
  },
  placementBarText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  placementBarButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  placementButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    height: 40,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  placementButtonRemove: {
    width: 40,
    paddingHorizontal: 0,
    backgroundColor: colors.surfaceMuted,
  },
  placementButtonSet: {
    backgroundColor: colors.accent,
  },
  placementButtonSetText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  frontViewButton: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadow.medium,
  },
  frontViewButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  osmIconBadgeTrafficLight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#0D9488",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  osmIconBadgeSpeedCamera: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#7C3AED",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  topRightControls: {
    position: "absolute",
    // Hugs the true right edge (rather than floating inward) so this reads as a compact,
    // edge-anchored toolbar the way Apple/Google Maps' own side controls do, instead of a
    // column of buttons sitting out over the middle of the route/map.
    right: spacing.sm,
    gap: spacing.xs + 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.low,
  },
  recenterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    ...shadow.low,
  },
  recenterPillText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  osmLoadingBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.low,
  },
  placeInfoLoadingBadge: {
    position: "absolute",
    alignSelf: "center",
    top: "48%",
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.low,
  },
  fab: {
    position: "absolute",
    right: spacing.xl,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.medium,
  },
  fabSecondary: {
    position: "absolute",
    right: spacing.xl,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.medium,
  },
  fabActive: {
    backgroundColor: colors.accent,
  },
});
