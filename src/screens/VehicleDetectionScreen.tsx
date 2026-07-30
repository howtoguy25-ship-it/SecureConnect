import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, LayoutChangeEvent } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { detectVehiclesInPhoto, decodePhotoForDetection, warmUpModel } from "@/services/vehicleDetection";
import { sampleLightbarActivity, pruneLightbarTracks } from "@/utils/lightbarDetector";
import { createSpeedTracker, type TrackedBox } from "@/utils/speedTracker";
import { locatePlateRegion } from "@/utils/plateLocator";
import { readPlateText } from "@/services/plateOcr";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import { Sentry } from "@/services/sentry";
import { MANEUVER_ICONS } from "@/components/NavigationInstructionCard";
import type { ManeuverType } from "@/services/directions";

// Shorter than the original 1.2s -- expo-camera's takePictureAsync is a discrete photo
// shutter (not a continuous frame stream the way a real video/frame-processor pipeline
// would be), so this is the fastest cadence that still leaves enough time for the shutter +
// JPEG decode + COCO-SSD inference to actually finish before the next capture fires. It's a
// real, honest limitation of expo-camera's still-photo API versus a true frame processor
// (e.g. react-native-vision-camera, which this app doesn't depend on) -- this makes
// detection noticeably snappier without claiming to be continuous video.
const CAPTURE_INTERVAL_MS = 700;
// While actively navigating, the map screen underneath is also live (GPS tracking, guidance,
// voice) and this screen's own tfjs CPU inference is already the heaviest thing running --
// a slightly slower cadence here is a real, deliberate trade-off for headroom during exactly
// the condition that was crashing/black-screening this screen before (see MapScreen's
// detectionOpen gating of its own camera-animation effects for the other half of that fix).
const CAPTURE_INTERVAL_MS_NAVIGATING = 1100;
// Attempts (each tied to one capture pass, ~1.2s apart) before giving up on a persistently
// unreadable plate for a given track -- caps total OCR work per vehicle instead of retrying
// forever on one that's obscured, too far, or at a bad angle.
const MAX_PLATE_ATTEMPTS = 6;

export interface VehicleDetectionNavOverlay {
  // Signed degrees: positive = next maneuver is to the right of current travel heading,
  // negative = left. Real, live GPS-course-vs-bearing-to-maneuver math (see MapScreen's
  // navOverlay), not a fixed/fake value.
  headingDeltaDeg: number;
  maneuver: ManeuverType;
  distanceMeters: number;
  instruction: string;
}

interface Props {
  onClose: () => void;
  // True whenever a route is active in the background, regardless of whether navOverlay could
  // be computed yet this render (e.g. no GPS fix at the exact instant this modal opened) -- used
  // to ease off capture cadence (see CAPTURE_INTERVAL_MS_NAVIGATING) independent of whether
  // there's a maneuver overlay to draw right now.
  isNavigating?: boolean;
  navOverlay?: VehicleDetectionNavOverlay | null;
}

export function VehicleDetectionScreen({ onClose, isNavigating = false, navOverlay = null }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<"loading-model" | "running" | "error">("loading-model");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<TrackedBox[]>([]);
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  // Plate text is display-only -- keyed by track id, never written anywhere but this
  // component's own state, cleared the moment a vehicle's track is pruned (see
  // pruneStalePlateState below). Nothing here is persisted or sent off-device.
  const [plateTexts, setPlateTexts] = useState<Map<number, string>>(new Map());
  // Track ids with a confirmed, actually-strobing lightbar signature (see
  // lightbarDetector.ts) -- real detected evidence, not a model's guess at vehicle type.
  const [emergencyTrackIds, setEmergencyTrackIds] = useState<Set<number>>(new Set());
  // Tapping a box locks visual focus onto that one vehicle (a highlighted outline + checkmark)
  // when several are in frame -- purely a this-screen, this-session UI focus aid, the same way
  // tapping a subject focuses a camera. Deliberately NOT a save/record feature: nothing here is
  // written to storage, sent anywhere, or retrievable after this screen closes -- it clears the
  // moment the vehicle's track is dropped or the screen closes, exactly like the live plate
  // text above.
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const onSelectBox = useCallback((id: number) => {
    setSelectedTrackId((prev) => (prev === id ? null : id));
  }, []);

  const cameraRef = useRef<CameraView>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturingRef = useRef(false);
  // Set the instant this screen unmounts (now a real unmount -- see MapScreen.tsx's Modal
  // fix -- not just hidden behind a still-visible-but-invisible modal). Checked after every
  // await in captureAndDetect below so an in-flight capture/detect/state-update chain can't
  // keep running (or touch a torn-down native camera session) after the screen is gone.
  const unmountedRef = useRef(false);
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);
  const speedTrackerRef = useRef(createSpeedTracker());
  const plateAttemptsRef = useRef(new Map<number, number>());
  const platesReadingRef = useRef(new Set<number>());
  // Mirrors `plateTexts` state so captureAndDetect can check it without depending on the
  // state itself -- keeps captureAndDetect referentially stable (empty deps), so the capture
  // interval effect below doesn't tear down and rebuild every time a plate read resolves.
  const plateTextsRef = useRef(new Map<number, string>());

  const [retryCount, setRetryCount] = useState(0);
  const retryLoad = useCallback(() => {
    setStatus("loading-model");
    setErrorMessage(null);
    setRetryCount((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    warmUpModel()
      .then(() => {
        if (!cancelled) setStatus("running");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Failed to load detection model.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const captureAndDetect = useCallback(async () => {
    if (capturingRef.current || unmountedRef.current || !cameraRef.current) return;
    capturingRef.current = true;
    try {
      Sentry.logger.info("vehicle-detection: calling takePictureAsync");
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.4, skipProcessing: true });
      if (!photo || unmountedRef.current) return;
      Sentry.logger.info("vehicle-detection: photo captured", { width: photo.width, height: photo.height });
      setPhotoSize({ width: photo.width, height: photo.height });
      const decoded = await decodePhotoForDetection(photo.uri);
      if (unmountedRef.current) return;
      const detected = await detectVehiclesInPhoto(decoded);
      if (unmountedRef.current) return;
      const tracked = speedTrackerRef.current.update(detected, photo.width, Date.now());
      setBoxes(tracked);

      const liveIds = speedTrackerRef.current.liveTrackIds();
      setSelectedTrackId((prev) => (prev !== null && !liveIds.has(prev) ? null : prev));

      // Real, evidence-based emergency-lightbar check (actively strobing red/blue light),
      // not a guess at vehicle type -- see lightbarDetector.ts.
      const nowMs = Date.now();
      const nextEmergencyIds = new Set<number>();
      for (const box of tracked) {
        if (sampleLightbarActivity(decoded, box.id, box.bbox, nowMs)) {
          nextEmergencyIds.add(box.id);
        }
      }
      setEmergencyTrackIds(nextEmergencyIds);
      pruneLightbarTracks(liveIds);

      // Prune cached plate state for any track id the tracker has fully dropped (not just
      // ones missing from this frame's `tracked` -- a track survives a short grace period on
      // a single missed detection, and pruning off `tracked` alone would wipe a legitimately
      // in-progress read on that miss).
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
            if (!text || unmountedRef.current) return;
            plateTextsRef.current.set(trackId, text);
            setPlateTexts(new Map(plateTextsRef.current));
          })
          .catch((err) => {
            Sentry.logger.error("vehicle-detection: plate OCR failed", { error: String(err) });
            console.warn("[vehicle-detection] plate OCR failed", err);
          })
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
    const intervalMs = isNavigating ? CAPTURE_INTERVAL_MS_NAVIGATING : CAPTURE_INTERVAL_MS;
    intervalRef.current = setInterval(captureAndDetect, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, captureAndDetect, isNavigating]);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
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
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {photoSize &&
        containerSize &&
        boxes.map((box) => {
          const [x, y, w, h] = box.bbox;
          const isEmergency = emergencyTrackIds.has(box.id);
          const isSelected = selectedTrackId === box.id;
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
            <Pressable
              key={box.id}
              onPress={() => onSelectBox(box.id)}
              style={[
                styles.box,
                isEmergency && styles.boxEmergency,
                isSelected && styles.boxSelected,
                {
                  left: x * scale + offsetX,
                  top: y * scale + offsetY,
                  width: w * scale,
                  height: h * scale,
                },
              ]}
            >
              <Text style={[styles.boxLabel, isEmergency && styles.boxLabelEmergency]}>
                {isEmergency ? `${box.label} — lights active` : `${box.label} ${Math.round(box.score * 100)}%`}
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
              {/* Tap a box to lock visual focus on it when several vehicles are in frame --
                  a this-screen, this-session UI aid only (like tapping to focus a camera).
                  Nothing about the selection is saved, stored, or sent anywhere; it clears the
                  moment the vehicle leaves frame or this screen closes. */}
              {isSelected && (
                <View style={styles.selectedBadge} pointerEvents="none">
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          );
        })}

      <View style={[styles.banner, { top: insets.top + spacing.md }]}>
        {status === "loading-model" && (
          <>
            <ActivityIndicator color="#fff" />
            {/* Loading is now just the model file fetch/cache (see vehicleDetection.ts's
                loadModelSkippingWarmup) -- the heavy warmup computation that used to block this
                screen was moved to land on the very first detected frame instead, so Close/
                Switch camera stay responsive here rather than fighting a busy JS thread. */}
            <Text style={styles.bannerText}>Loading detection model…</Text>
          </>
        )}
        {status === "running" && (
          <Text style={styles.bannerText}>
            Detecting vehicles — amber box,
            generic "Vehicle"/"Heavy Vehicle". Turns red with "lights active" only once an
            actual strobing red/blue light is confirmed in view for a few seconds — real
            detected evidence, not a guess at vehicle type (a marked/unmarked car with no
            lights on shows no different to any other car, the same way a driver wouldn't
            notice one either). Speed (top-right of box) is a rough estimate (assumes average
            car width, no calibration) — not radar-accurate, and shows "PARKED" once a
            vehicle has been still for a couple of seconds. A plate number (bottom of box,
            cyan) only ever appears once real on-device text recognition actually reads one
            from a face-on vehicle — it's never stored or sent anywhere, just shown live
            while that vehicle stays in view.
          </Text>
        )}
        {status === "error" && (
          <>
            <Text style={styles.bannerText}>{errorMessage ?? "Something went wrong."}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && { opacity: pressedOpacity }]}
              onPress={retryLoad}
              accessibilityLabel="Retry loading detection model"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Route stays visible and in sync while viewing vehicle detection during active
          navigation -- guidance/GPS tracking keep running underneath (see MapScreen's
          navOverlay), this is purely a visual read of where the road actually goes relative to
          current travel heading. headingDeltaDeg is real, live bearing math, not a fixed
          straight-ahead line: it shifts/tilts toward whichever side the next turn is really on,
          and re-centers as the road heading and travel heading converge. */}
      {navOverlay && (
        <View style={styles.routeOverlayWrap} pointerEvents="none">
          <View style={styles.routeOverlayChip}>
            <Ionicons
              name={(navOverlay.maneuver && MANEUVER_ICONS[navOverlay.maneuver]) || "arrow-up"}
              size={16}
              color="#FFFFFF"
            />
            <Text style={styles.routeOverlayChipText} numberOfLines={1}>
              {navOverlay.distanceMeters >= 1000
                ? `${(navOverlay.distanceMeters / 1000).toFixed(1)} km`
                : `${Math.round(navOverlay.distanceMeters)} m`}{" "}
              · {navOverlay.instruction}
            </Text>
          </View>
          <View
            style={[
              styles.routeRibbon,
              {
                transform: [
                  { perspective: 500 },
                  { translateX: Math.max(-70, Math.min(70, navOverlay.headingDeltaDeg)) * 1.3 },
                  { rotateZ: `${Math.max(-70, Math.min(70, navOverlay.headingDeltaDeg)) * 0.17}deg` },
                  { rotateX: "58deg" },
                ],
              },
            ]}
          />
        </View>
      )}

      {/* Only control left at the bottom now that Switch Camera is gone (per explicit request
          -- it also removed the whole facing-switch-mid-capture crash risk category with it).
          Centered and a bit larger since it's the sole action here. */}
      <Pressable
        style={({ pressed }) => [
          styles.closeButton,
          { bottom: insets.bottom + spacing.xl },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={onClose}
        accessibilityLabel="Close vehicle detection"
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
  boxSelected: {
    borderColor: "#22D3EE",
    borderWidth: 4,
  },
  selectedBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#22D3EE",
    alignItems: "center",
    justifyContent: "center",
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
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  routeOverlayWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 150,
    height: 190,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  routeOverlayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    maxWidth: "82%",
  },
  routeOverlayChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  // A tilted (rotateX), perspective-projected rectangle renders as a road-like trapezoid
  // narrowing into the distance -- a real, well-known transform trick, not an image asset.
  // translateX/rotateZ (set inline, computed from navOverlay.headingDeltaDeg) shift and tilt it
  // toward whichever side the next real maneuver actually is, instead of always pointing
  // straight ahead regardless of the upcoming turn. shadow.high gives it a grounded drop
  // shadow so it reads as placed on the road rather than pasted flat over the camera feed.
  routeRibbon: {
    width: 64,
    height: 240,
    borderRadius: 10,
    backgroundColor: "rgba(37, 99, 235, 0.55)",
    borderWidth: 2,
    borderColor: "rgba(147, 197, 253, 0.9)",
    ...shadow.high,
  },
  closeButton: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  closeButtonText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 15,
  },
});
