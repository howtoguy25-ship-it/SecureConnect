import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Modal, Share, ActivityIndicator } from "react-native";
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
import { TRACKLINE_MAP_STYLE } from "@/utils/mapStyle";

import { useLocation } from "@/context/LocationContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { MuteButton } from "@/components/MuteButton";
import { DestinationSearchBar } from "@/components/DestinationSearchBar";
import { NavigationInstructionCard } from "@/components/NavigationInstructionCard";
import { RouteOptionsCard } from "@/components/RouteOptionsCard";
import { AlertMarker } from "@/components/AlertMarker";
import { AlertBanner } from "@/components/AlertBanner";
import { BannerAdBar } from "@/components/BannerAdBar";
import { AdsErrorBoundary } from "@/components/AdsErrorBoundary";
import { AlertReportSheet } from "@/screens/AlertReportSheet";
import { AlertDetailSheet } from "@/screens/AlertDetailSheet";
import { PlaceInfoSheet } from "@/screens/PlaceInfoSheet";
import { getRouteOptions, DirectionsApiError, type Route, type RouteProfileKey } from "@/services/directions";
import { findNearestPlace, getPlaceInfo, type PlaceDetails, type PlaceInfo } from "@/services/places";
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
import type { AlertDoc, AlertType } from "@/types/alert";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { Sentry } from "@/services/sentry";

const DIAGNOSTIC_DISABLE_MAPVIEW = false;

export function MapScreen() {
  const { location } = useLocation();
  const { user } = useAuth();
  const { settings, voiceEnabled } = useSettings();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView>(null);
  const reportSheetRef = useRef<BottomSheet>(null);
  const detailSheetRef = useRef<BottomSheet>(null);
  const placeInfoSheetRef = useRef<BottomSheet>(null);

  const [route, setRoute] = useState<Route | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
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
  const anySheetOpen = reportSheetOpen || detailSheetOpen || placeInfoSheetOpen;
  const [alertPlacementLatLng, setAlertPlacementLatLng] = useState<LatLng | null>(null);

  // Real "tap a shop, see its info" -- iOS's native MapKit provider here has no onPoiClick
  // event (react-native-maps only fires that on Google Maps/Android), so instead any map tap
  // looks up whatever business is closest to that point via Places Nearby Search + Details.
  const [placeInfo, setPlaceInfo] = useState<PlaceInfo | null>(null);
  const [placeInfoLoading, setPlaceInfoLoading] = useState(false);
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
  // NOT the custom Map3DView module above -- this works on both providers (Apple MapKit on
  // iOS, Google Maps on Android) with zero native-module risk, which matters given the iOS
  // crash history around the custom 3D module. Defaults on whenever navigation starts, and
  // the user can drop back to a flat top-down view without exiting navigation entirely.
  const [followTilt, setFollowTilt] = useState(true);

  const currentLatLng = useMemo(
    () =>
      location
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : null,
    [location]
  );

  const heading = location?.coords.heading != null && location.coords.heading >= 0
    ? location.coords.heading
    : 0;

  // Guards the very first tick after a route starts so the fitToCoordinates overview (below,
  // in onDestinationSelected) gets a moment on screen before the camera snaps into the tilted
  // close-follow -- same "show the whole route, then follow" beat Apple Maps uses.
  const navStartedAtRef = useRef(0);

  useEffect(() => {
    if (!route || !followTilt || !currentLatLng) return;
    if (Date.now() - navStartedAtRef.current < 1200) return;
    mapRef.current?.animateCamera(
      { center: currentLatLng, heading, pitch: 60, zoom: 18 },
      { duration: 600 }
    );
  }, [route, followTilt, currentLatLng, heading]);

  const toggleFollowTilt = useCallback(() => {
    setFollowTilt((was) => {
      const next = !was;
      if (!next && currentLatLng) {
        mapRef.current?.animateCamera(
          { center: currentLatLng, heading: 0, pitch: 0, zoom: 15 },
          { duration: 500 }
        );
      }
      return next;
    });
  }, [currentLatLng]);

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
      speak(stepToSpeak.instruction);
    }
  }, [currentLatLng, route, voiceEnabled, activeStepIndex]);

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

  const fetchRouteOptions = useCallback(
    async (destination: LatLng, waypoint?: LatLng) => {
      if (!currentLatLng) return;
      setLoadingRouteOptions(true);
      setRouteOptionsError(null);
      try {
        const options = await getRouteOptions(currentLatLng, destination, waypoint);
        setRouteOptions(options);
        setSelectedProfile("normal");
        mapRef.current?.fitToCoordinates(options.normal.polyline, {
          edgePadding: { top: 120, right: 60, bottom: 260, left: 60 },
          animated: true,
        });
      } catch (err) {
        Sentry.logger.error("map: failed to fetch route options", { error: String(err) });
        console.warn("[map] failed to fetch route options", err);
        setRouteOptionsError(
          err instanceof DirectionsApiError
            ? `Couldn't find a route (${err.status})`
            : "Couldn't find a route -- check your connection"
        );
      } finally {
        setLoadingRouteOptions(false);
      }
    },
    [currentLatLng]
  );

  // Min zoom before the OSM layer queries at all -- a zoomed-out view spans too wide an area
  // for a reasonable Overpass request/response size. ~0.03 latitudeDelta is roughly a
  // few-km-wide view, comparable to web's OSM_LAYER_MIN_ZOOM.
  const OSM_LAYER_MAX_DELTA = 0.03;

  const onRegionChangeComplete = useCallback((region: Region) => {
    if (osmDebounceRef.current) clearTimeout(osmDebounceRef.current);
    if (!settings.showTrafficLights && !settings.showSpeedCameras) {
      setOsmData(null);
      setOsmLoading(false);
      return;
    }
    if (region.latitudeDelta > OSM_LAYER_MAX_DELTA) {
      setOsmData(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showTrafficLights, settings.showSpeedCameras]);

  const onMapPress = useCallback(
    (e: MapPressEvent) => {
      // Don't hijack a tap that's meant for something else already in progress -- placing an
      // alert pin, or a sheet already open and eating input.
      if (placingAlert || anySheetOpen) return;
      const coordinate = e.nativeEvent.coordinate;
      setPlaceInfoLoading(true);
      findNearestPlace(coordinate)
        .then((nearest) => {
          if (!nearest) return null;
          return getPlaceInfo(nearest.placeId);
        })
        .then((info) => {
          if (!info) return;
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
      fetchRouteOptions(place.location);
    },
    [currentLatLng, fetchRouteOptions]
  );

  const onStopSelected = useCallback(
    (place: PlaceDetails) => {
      if (!pendingDestination) return;
      setStopLocation(place.location);
      setPickingStop(false);
      fetchRouteOptions(pendingDestination.location, place.location);
    },
    [pendingDestination, fetchRouteOptions]
  );

  const onSelectProfile = useCallback(
    (key: RouteProfileKey) => {
      setSelectedProfile(key);
      const previewRoute = routeOptions?.[key];
      if (previewRoute) {
        mapRef.current?.fitToCoordinates(previewRoute.polyline, {
          edgePadding: { top: 120, right: 60, bottom: 260, left: 60 },
          animated: true,
        });
      }
    },
    [routeOptions]
  );

  const confirmRoute = useCallback(() => {
    if (!routeOptions || !pendingDestination) return;
    const chosen = routeOptions[selectedProfile];
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
    setPendingDestination(null);
  }, [routeOptions, selectedProfile, pendingDestination]);

  const cancelRouteOptions = useCallback(() => {
    setRouteOptions(null);
    setPendingDestination(null);
    setStopLocation(null);
    setPickingStop(false);
    setRouteOptionsError(null);
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
  // 2. onAlertTypeSelected: sheet closes, placement mode starts (draggable pin at the live
  //    position, type remembered in a ref for the eventual save).
  // 3. confirmAlertPlacement ("Set"): actually writes the alert at wherever the pin ended up.
  // 4. cancelAlertPlacement ("Cancel"): aborts, no write.
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
      /* Google provider needs a custom dev client on iOS (unavailable in Expo Go); Android gets it for free. */
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        mapType={mapType}
        // The custom black/green style only ever applies to the "standard" map type --
        // satellite/hybrid imagery has no styleable roads/land polygons to restyle, so
        // Google/Apple just ignore it there. Safe to always pass.
        customMapStyle={TRACKLINE_MAP_STYLE}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          latitude: currentLatLng?.latitude ?? 37.7749,
          longitude: currentLatLng?.longitude ?? -122.4194,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onMapPress}
      >
        {route && (
          <Polyline coordinates={route.polyline} strokeWidth={5} strokeColor="#2563EB" />
        )}
        {/* Preview of whichever route profile is highlighted in the picker below, before
            the user commits to it with Start -- "click a route, see its line" like Apple/
            Google Maps' own route picker. Dashed so it's visually distinct from the solid
            committed-route line above (the two are mutually exclusive: `route` is only ever
            set once routeOptions has been cleared by confirmRoute). */}
        {routeOptions && (
          <Polyline
            coordinates={routeOptions[selectedProfile].polyline}
            strokeWidth={4}
            strokeColor="#2563EB"
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
        {/* Manual alert placement -- a real draggable pin (react-native-maps' own built-in
            drag support), not just wherever GPS says the phone is right now. */}
        {placingAlert && alertPlacementLatLng && (
          <Marker
            coordinate={alertPlacementLatLng}
            draggable
            onDragEnd={(e) => setAlertPlacementLatLng(e.nativeEvent.coordinate)}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.placementPinWrap}>
              <Ionicons name="location" size={44} color={colors.danger} />
            </View>
          </Marker>
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
            >
              <View style={styles.osmIconBadgeSpeedCamera}>
                <MaterialCommunityIcons name="cctv" size={11} color="#FFFFFF" />
              </View>
            </Marker>
          ))}
      </MapView>
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
          loading={loadingRouteOptions}
          errorText={routeOptionsError}
          selected={selectedProfile}
          onSelect={onSelectProfile}
          onStart={confirmRoute}
          onCancel={cancelRouteOptions}
          onAddStop={() => setPickingStop(true)}
          hasStop={!!stopLocation}
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
        />
      )}

      {/* Pushed below the instruction card while navigating (instead of sharing its top
          offset) so it never overlaps the turn text -- it used to sit at the same `top` as
          the full-width card and render on top of its right edge. */}
      <View
        style={[
          styles.topRightControls,
          { top: insets.top + spacing.md + (route ? 96 : 0) },
        ]}
      >
        {route && (
          <Pressable
            style={({ pressed }) => [styles.settingsButton, pressed && { opacity: pressedOpacity }]}
            onPress={toggleFollowTilt}
            accessibilityLabel={followTilt ? "Exit close-follow view" : "Resume close-follow view"}
          >
            <Ionicons name={followTilt ? "close" : "navigate"} size={20} color={colors.text} />
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
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Hidden while a bottom sheet is open or an alert is being placed -- previously these
          stayed rendered at their normal position underneath a sheet, and whichever FAB sat
          just above the sheet's top edge showed as a clipped sliver peeking out from behind
          it instead of being cleanly covered or cleanly visible. */}
      {!anySheetOpen && !placingAlert && (
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
          <Text style={styles.placementBarText}>Drag the pin to the exact spot</Text>
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

      <Modal visible={detectionOpen} animationType="slide" onRequestClose={() => setDetectionOpen(false)}>
        <VehicleDetectionScreen onClose={() => setDetectionOpen(false)} />
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
  placementPinWrap: {
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
    right: spacing.md,
    gap: spacing.sm,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.low,
  },
  osmLoadingBadge: {
    width: 44,
    height: 44,
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
