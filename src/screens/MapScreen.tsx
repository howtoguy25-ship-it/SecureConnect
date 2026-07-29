import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform, Modal, Share } from "react-native";
import MapView, { PROVIDER_GOOGLE, Polyline, Marker, type Region } from "react-native-maps";
import { Map3DView, isMap3DSupported } from "map3d";
import { Ionicons } from "@expo/vector-icons";
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
import { getRouteOptions, type Route, type RouteProfileKey } from "@/services/directions";
import type { PlaceDetails } from "@/services/places";
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

  const [route, setRoute] = useState<Route | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const guidanceRef = useRef(createGuidanceState());

  // Route-choice flow: destination picked -> fetch all 3 profiles -> user picks one (with a
  // live preview of that profile's line on the map) -> Start commits it into `route` above.
  const [pendingDestination, setPendingDestination] = useState<PlaceDetails | null>(null);
  const [stopLocation, setStopLocation] = useState<LatLng | null>(null);
  const [pickingStop, setPickingStop] = useState(false);
  const [routeOptions, setRouteOptions] = useState<Record<RouteProfileKey, Route> | null>(null);
  const [loadingRouteOptions, setLoadingRouteOptions] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<RouteProfileKey>("normal");

  const [nearbyAlerts, setNearbyAlerts] = useState<AlertDoc[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDoc | null>(null);

  // Static OSM traffic-light/speed-camera layer -- fetched per visible map region (debounced
  // on region-change-complete, gated behind a min-zoom so a zoomed-out view doesn't fire an
  // Overpass query over a huge area), independent of the live community AlertType markers.
  const [osmData, setOsmData] = useState<OsmTrafficData | null>(null);
  const osmDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [detectionOpen, setDetectionOpen] = useState(false);
  // Real photorealistic 3D satellite (Android only for now, see modules/map3d) -- Stage 1:
  // core rendering + live position + the active route only, mirroring the web build's own
  // staged rollout. Renders as an overlay on top of the existing MapView, matching how the
  // web version layers its own Map3DElement over the classic 2D map.
  const [show3D, setShow3D] = useState(false);

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
      return;
    }
    if (region.latitudeDelta > OSM_LAYER_MAX_DELTA) {
      setOsmData(null);
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
      fetchOsmTrafficData(bounds)
        .then(setOsmData)
        .catch((err) => console.warn("[map] OSM traffic layer fetch failed", err));
    }, 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showTrafficLights, settings.showSpeedCameras]);

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
    if (!routeOptions) return;
    const chosen = routeOptions[selectedProfile];
    guidanceRef.current = createGuidanceState();
    setActiveStepIndex(0);
    setRoute(chosen);
    navStartedAtRef.current = Date.now();
    setFollowTilt(true);
    mapRef.current?.fitToCoordinates(chosen.polyline, {
      edgePadding: { top: 120, right: 60, bottom: 120, left: 60 },
      animated: true,
    });
    setRouteOptions(null);
    setPendingDestination(null);
  }, [routeOptions, selectedProfile]);

  const cancelRouteOptions = useCallback(() => {
    setRouteOptions(null);
    setPendingDestination(null);
    setStopLocation(null);
    setPickingStop(false);
  }, []);

  const exitNavigation = useCallback(() => {
    stopSpeaking();
    setRoute(null);
    setActiveStepIndex(0);
    setFollowTilt(true);
    setStopLocation(null);
  }, []);

  const onShareAlert = useCallback(
    async (type: AlertType) => {
      if (!currentLatLng || !user) return;
      await reportAlert(type, currentLatLng, user.uid);
      reportSheetRef.current?.close();
    },
    [currentLatLng, user]
  );

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
              <View style={styles.osmDotTrafficLight} />
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
              <View style={styles.osmDotSpeedCamera} />
            </Marker>
          ))}
      </MapView>
      )}

      {show3D && isMap3DSupported && currentLatLng && (
        <Map3DView
          style={StyleSheet.absoluteFill}
          center={currentLatLng}
          markerPosition={currentLatLng}
          routeCoordinates={route?.polyline}
        />
      )}

      {!route && !pendingDestination && (
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
        <MuteButton />
        <Pressable
          style={({ pressed }) => [styles.settingsButton, pressed && { opacity: pressedOpacity }]}
          onPress={() => navigation.navigate("Settings")}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 24 },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={() => reportSheetRef.current?.expand()}
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

      <Modal visible={detectionOpen} animationType="slide" onRequestClose={() => setDetectionOpen(false)}>
        <VehicleDetectionScreen onClose={() => setDetectionOpen(false)} />
      </Modal>

      <AlertReportSheet ref={reportSheetRef} onShare={onShareAlert} />
      <AlertDetailSheet
        ref={detailSheetRef}
        alert={selectedAlert}
        currentUid={user?.uid ?? null}
        onDelete={onDeleteAlert}
        onHide={onHideAlert}
        onConfirmStillHere={onConfirmStillHere}
      />

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
  osmDotTrafficLight: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0D9488",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  osmDotSpeedCamera: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#7C3AED",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
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
