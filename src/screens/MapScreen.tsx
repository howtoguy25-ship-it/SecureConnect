import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Platform, Modal } from "react-native";
import MapView, { PROVIDER_GOOGLE, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useLocation } from "@/context/LocationContext";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { MuteButton } from "@/components/MuteButton";
import { DestinationSearchBar } from "@/components/DestinationSearchBar";
import { NavigationInstructionCard } from "@/components/NavigationInstructionCard";
import { AlertMarker } from "@/components/AlertMarker";
import { AlertBanner } from "@/components/AlertBanner";
import { AlertReportSheet } from "@/screens/AlertReportSheet";
import { AlertDetailSheet } from "@/screens/AlertDetailSheet";
import { getDirections, type Route } from "@/services/directions";
import type { PlaceDetails } from "@/services/places";
import { createGuidanceState, evaluateGuidance } from "@/services/navigationGuidance";
import { speak, stopSpeaking } from "@/services/voice";
import {
  subscribeNearbyAlerts,
  reportAlert,
  deleteAlert,
  hideAlertForUser,
  confirmAlert,
} from "@/services/alerts";
import { sirenDetection } from "@/services/sirenDetection";
import { VehicleDetectionScreen } from "@/screens/VehicleDetectionScreen";
import type { AlertDoc, AlertType } from "@/types/alert";
import type { RootStackParamList } from "@/navigation/RootNavigator";

export function MapScreen() {
  const { location } = useLocation();
  const { user } = useAuth();
  const { settings, voiceEnabled } = useSettings();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const mapRef = useRef<MapView>(null);
  const reportSheetRef = useRef<BottomSheet>(null);
  const detailSheetRef = useRef<BottomSheet>(null);

  const [route, setRoute] = useState<Route | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const guidanceRef = useRef(createGuidanceState());

  const [nearbyAlerts, setNearbyAlerts] = useState<AlertDoc[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertDoc | null>(null);

  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const [detectionOpen, setDetectionOpen] = useState(false);

  const currentLatLng = useMemo(
    () =>
      location
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : null,
    [location]
  );

  // Subscribe to nearby alerts (Phase 3 + Phase 5) whenever position or radius changes meaningfully.
  useEffect(() => {
    if (!currentLatLng || !user) return;
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
    settings.alertRadiusKm,
    currentLatLng ? Math.round(currentLatLng.latitude * 200) : null,
    currentLatLng ? Math.round(currentLatLng.longitude * 200) : null,
  ]);

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

  // EV Radar (Phase 6): start/stop siren detection with the map screen lifecycle.
  useEffect(() => {
    sirenDetection.setSensitivity(settings.sirenSensitivity);
    sirenDetection.start();

    const unsubscribe = sirenDetection.onDetection(async ({ label }) => {
      setBannerMessage("Emergency vehicle detected nearby");
      setBannerVisible(true);

      if (settings.autoShareDetections && currentLatLng && user) {
        try {
          await reportAlert("emergency_vehicle", currentLatLng, user.uid);
        } catch (err) {
          console.warn("[siren] auto-share detection failed", err);
        }
      }
    });

    return () => {
      unsubscribe();
      sirenDetection.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sirenSensitivity, settings.autoShareDetections, currentLatLng?.latitude, user?.uid]);

  const onDestinationSelected = useCallback(
    async (place: PlaceDetails) => {
      if (!currentLatLng) return;
      const newRoute = await getDirections(currentLatLng, place.location);
      guidanceRef.current = createGuidanceState();
      setActiveStepIndex(0);
      setRoute(newRoute);
      mapRef.current?.fitToCoordinates(newRoute.polyline, {
        edgePadding: { top: 120, right: 60, bottom: 120, left: 60 },
        animated: true,
      });
    },
    [currentLatLng]
  );

  const exitNavigation = useCallback(() => {
    stopSpeaking();
    setRoute(null);
    setActiveStepIndex(0);
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
  const remainingDistanceMeters = route
    ? route.steps.slice(activeStepIndex).reduce((sum, s) => sum + s.distanceMeters, 0)
    : 0;

  return (
    <View style={styles.container}>
      {/* Google provider needs a custom dev client on iOS (unavailable in Expo Go); Android gets it for free. */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          latitude: currentLatLng?.latitude ?? 37.7749,
          longitude: currentLatLng?.longitude ?? -122.4194,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {route && (
          <Polyline coordinates={route.polyline} strokeWidth={5} strokeColor="#2563EB" />
        )}
        {nearbyAlerts.map((alert) => (
          <AlertMarker key={alert.id} alert={alert} onPress={onMarkerPress} />
        ))}
      </MapView>

      <AlertBanner
        visible={bannerVisible}
        message={bannerMessage}
        onDismiss={() => setBannerVisible(false)}
      />

      {!route && (
        <DestinationSearchBar biasLocation={currentLatLng ?? undefined} onDestinationSelected={onDestinationSelected} />
      )}

      {route && (
        <NavigationInstructionCard
          step={activeStep}
          etaText={route.etaText}
          distanceRemainingText={`${(remainingDistanceMeters / 1000).toFixed(1)} km`}
          onExit={exitNavigation}
        />
      )}

      <View style={styles.topRightControls}>
        <MuteButton />
        <Pressable style={styles.settingsButton} onPress={() => navigation.navigate("Settings")}>
          <Ionicons name="settings-outline" size={20} color="#0B1220" />
        </Pressable>
      </View>

      <Pressable style={styles.fab} onPress={() => reportSheetRef.current?.expand()}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>

      <Pressable
        style={styles.fabSecondary}
        onPress={() => setDetectionOpen(true)}
        accessibilityLabel="Live vehicle detection"
      >
        <Ionicons name="videocam" size={24} color="#FFFFFF" />
      </Pressable>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topRightControls: {
    position: "absolute",
    top: 56,
    right: 12,
    gap: 10,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fab: {
    position: "absolute",
    bottom: 32,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  fabSecondary: {
    position: "absolute",
    bottom: 102,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
