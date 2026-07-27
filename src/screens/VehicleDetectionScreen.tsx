import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, LayoutChangeEvent } from "react-native";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { detectVehiclesInPhoto, warmUpModel } from "@/services/vehicleDetection";
import { createSpeedTracker, type TrackedBox } from "@/utils/speedTracker";
import { locatePlateRegion } from "@/utils/plateLocator";
import { readPlateText } from "@/services/plateOcr";
import { colors, radius, spacing, pressedOpacity } from "@/theme/tokens";

const CAPTURE_INTERVAL_MS = 1200;
// Attempts (each tied to one capture pass, ~1.2s apart) before giving up on a persistently
// unreadable plate for a given track -- caps total OCR work per vehicle instead of retrying
// forever on one that's obscured, too far, or at a bad angle.
const MAX_PLATE_ATTEMPTS = 6;

interface Props {
  onClose: () => void;
}

export function VehicleDetectionScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [status, setStatus] = useState<"loading-model" | "running" | "error">("loading-model");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<TrackedBox[]>([]);
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  // Plate text is display-only -- keyed by track id, never written anywhere but this
  // component's own state, cleared the moment a vehicle's track is pruned (see
  // pruneStalePlateState below). Nothing here is persisted or sent off-device.
  const [plateTexts, setPlateTexts] = useState<Map<number, string>>(new Map());

  const cameraRef = useRef<CameraView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturingRef = useRef(false);
  const speedTrackerRef = useRef(createSpeedTracker());
  const plateAttemptsRef = useRef(new Map<number, number>());
  const platesReadingRef = useRef(new Set<number>());
  // Mirrors `plateTexts` state so captureAndDetect can check it without depending on the
  // state itself -- keeps captureAndDetect referentially stable (empty deps), so the capture
  // interval effect below doesn't tear down and rebuild every time a plate read resolves.
  const plateTextsRef = useRef(new Map<number, string>());

  useEffect(() => {
    warmUpModel()
      .then(() => setStatus("running"))
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Failed to load detection model.");
        setStatus("error");
      });
  }, []);

  const captureAndDetect = useCallback(async () => {
    if (capturingRef.current || !cameraRef.current) return;
    capturingRef.current = true;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, skipProcessing: true });
      if (!photo) return;
      setPhotoSize({ width: photo.width, height: photo.height });
      const detected = await detectVehiclesInPhoto(photo.uri);
      const tracked = speedTrackerRef.current.update(detected, photo.width, Date.now());
      setBoxes(tracked);

      // Prune cached plate state for any track id the tracker has fully dropped (not just
      // ones missing from this frame's `tracked` -- a track survives a short grace period on
      // a single missed detection, and pruning off `tracked` alone would wipe a legitimately
      // in-progress read on that miss).
      const liveIds = speedTrackerRef.current.liveTrackIds();
      for (const id of plateAttemptsRef.current.keys()) {
        if (!liveIds.has(id)) plateAttemptsRef.current.delete(id);
      }
      let pruned = false;
      for (const id of plateTextsRef.current.keys()) {
        if (!liveIds.has(id)) {
          plateTextsRef.current.delete(id);
          pruned = true;
        }
      }
      if (pruned) setPlateTexts(new Map(plateTextsRef.current));

      for (const box of tracked) {
        if (plateTextsRef.current.has(box.id) || platesReadingRef.current.has(box.id)) continue;
        const attempts = plateAttemptsRef.current.get(box.id) ?? 0;
        if (attempts >= MAX_PLATE_ATTEMPTS) continue;
        const region = locatePlateRegion(box.bbox);
        if (!region) continue;

        plateAttemptsRef.current.set(box.id, attempts + 1);
        platesReadingRef.current.add(box.id);
        const trackId = box.id;
        readPlateText(photo.uri, region)
          .then((text) => {
            if (!text) return;
            plateTextsRef.current.set(trackId, text);
            setPlateTexts(new Map(plateTextsRef.current));
          })
          .catch((err) => console.warn("[vehicle-detection] plate OCR failed", err))
          .finally(() => platesReadingRef.current.delete(trackId));
      }
    } catch (err) {
      console.warn("[vehicle-detection] capture/detect failed", err);
    } finally {
      capturingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    intervalRef.current = setInterval(captureAndDetect, CAPTURE_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, captureAndDetect]);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  const toggleFacing = useCallback(() => {
    setBoxes([]);
    plateAttemptsRef.current.clear();
    platesReadingRef.current.clear();
    plateTextsRef.current = new Map();
    setPlateTexts(new Map());
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  }, []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          TrackLine needs camera access to detect vehicles in view.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant camera access</Text>
        </Pressable>
        <Pressable onPress={onClose}>
          <Text style={styles.closeLink}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const scale =
    photoSize && containerSize
      ? Math.max(containerSize.width / photoSize.width, containerSize.height / photoSize.height)
      : 1;
  const offsetX = photoSize && containerSize ? (containerSize.width - photoSize.width * scale) / 2 : 0;
  const offsetY = photoSize && containerSize ? (containerSize.height - photoSize.height * scale) / 2 : 0;

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      {photoSize &&
        containerSize &&
        boxes.map((box) => {
          const [x, y, w, h] = box.bbox;
          const isEmergency = box.label !== "Vehicle";
          const plateText = plateTexts.get(box.id);
          const speedLabel =
            box.state === "parked"
              ? "PARKED"
              : box.speedKmh === null
                ? null
                : Math.abs(box.speedKmh) < 3
                  ? "steady"
                  : `${box.speedKmh > 0 ? "▲" : "▼"} ${Math.round(Math.abs(box.speedKmh))} km/h`;
          return (
            <View
              key={box.id}
              style={[
                styles.box,
                isEmergency && styles.boxEmergency,
                {
                  left: x * scale + offsetX,
                  top: y * scale + offsetY,
                  width: w * scale,
                  height: h * scale,
                },
              ]}
            >
              <Text style={[styles.boxLabel, isEmergency && styles.boxLabelEmergency]}>
                {box.label} {Math.round((box.confidence ?? box.score) * 100)}%
              </Text>
              {/* Anchored top-right, just outside the box edge, separate from the type/
                  confidence label at top-left -- so it never overlaps the vehicle or the
                  other label, and updates live every frame the tracker emits a speed. */}
              {speedLabel && (
                <Text
                  style={[styles.speedLabel, box.state === "parked" && styles.speedLabelParked]}
                >
                  {speedLabel}
                </Text>
              )}
              {/* Plate text only ever appears once on-device OCR actually confirms a real
                  read (see plateOcr.ts) -- never a location guess with nothing behind it, and
                  never stored or sent anywhere, just held in this screen's own state for as
                  long as the vehicle stays tracked. Anchored bottom-center so it never
                  competes with the type/speed badges at the top of the box. */}
              {plateText && (
                <View style={styles.plateLabelWrap} pointerEvents="none">
                  <Text style={styles.plateLabel}>{plateText}</Text>
                </View>
              )}
            </View>
          );
        })}

      <View style={[styles.banner, { top: insets.top + spacing.md }]}>
        {status === "loading-model" && (
          <>
            <ActivityIndicator color="#fff" />
            <Text style={styles.bannerText}>Loading detection model…</Text>
          </>
        )}
        {status === "running" && (
          <Text style={styles.bannerText}>
            Detecting vehicles ({facing === "back" ? "back" : "front"} camera) — a
            custom-trained model guesses ambulance/fire truck/police car (red box, shown
            with its confidence %) when confident enough, generic "Vehicle" (amber box)
            otherwise. It's trained on a modest ~500-image dataset — a real but imperfect
            guess, not certified identification. Speed (top-right of box) is a rough estimate
            (assumes average car width, no calibration) — not radar-accurate, and shows
            "PARKED" once a vehicle has been still for a couple of seconds. A plate number
            (bottom of box, cyan) only ever appears once real on-device text recognition
            actually reads one from a face-on vehicle — it's never stored or sent anywhere,
            just shown live while that vehicle stays in view.
          </Text>
        )}
        {status === "error" && (
          <Text style={styles.bannerText}>{errorMessage ?? "Something went wrong."}</Text>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.switchButton,
          { bottom: insets.bottom + spacing.xl },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={toggleFacing}
        accessibilityLabel="Switch camera"
      >
        <Ionicons name="camera-reverse" size={22} color={colors.text} />
        <Text style={styles.switchButtonText}>Switch camera</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.closeButton,
          { bottom: insets.bottom + spacing.xl },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={onClose}
      >
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permissionText: {
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  closeLink: {
    color: "#9CA3AF",
    marginTop: 8,
  },
  box: {
    position: "absolute",
    borderWidth: 3,
    borderColor: "#F59E0B",
  },
  boxEmergency: {
    borderColor: "#DC2626",
  },
  boxLabel: {
    position: "absolute",
    top: -22,
    left: 0,
    backgroundColor: "#F59E0B",
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  boxLabelEmergency: {
    backgroundColor: "#DC2626",
    color: "#fff",
  },
  speedLabel: {
    position: "absolute",
    top: -22,
    right: 0,
    backgroundColor: "#111827",
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  speedLabelParked: {
    backgroundColor: "#4B5563",
  },
  plateLabelWrap: {
    position: "absolute",
    bottom: -24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  plateLabel: {
    backgroundColor: "#22D3EE",
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "monospace",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: "hidden",
  },
  banner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  bannerText: {
    color: "#fff",
    fontSize: 12,
    flex: 1,
  },
  switchButton: {
    position: "absolute",
    right: spacing.xl,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm - 2,
  },
  switchButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  closeButton: {
    position: "absolute",
    left: spacing.xl,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  closeButtonText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
});
