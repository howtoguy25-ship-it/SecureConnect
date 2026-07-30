import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, LayoutChangeEvent } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { detectVehiclesInPhoto, decodePhotoForDetection, warmUpModel } from "@/services/vehicleDetection";
import { sampleLightbarActivity, pruneLightbarTracks } from "@/utils/lightbarDetector";
import { createSpeedTracker, type TrackedBox } from "@/utils/speedTracker";
import { locatePlateRegion, type PlateRegion } from "@/utils/plateLocator";
import { readPlateText } from "@/services/plateOcr";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import { Sentry } from "@/services/sentry";

// Shorter than the original 1.2s -- expo-camera's takePictureAsync is a discrete photo
// shutter (not a continuous frame stream the way a real video/frame-processor pipeline
// would be), so this is the fastest cadence that still leaves enough time for the shutter +
// JPEG decode + COCO-SSD inference to actually finish before the next capture fires. It's a
// real, honest limitation of expo-camera's still-photo API versus a true frame processor
// (e.g. react-native-vision-camera, which this app doesn't depend on) -- this makes
// detection noticeably snappier without claiming to be continuous video. A capture already in
// flight just makes the next tick a no-op (see capturingRef below) rather than stacking, so
// this cadence stays safe even on a slower device/frame.
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
// Real, confirmed failure mode this guards against: takePictureAsync's promise never settling
// at all (neither resolving nor rejecting) -- a stalled native camera call would otherwise leave
// capturingRef permanently true, silently freezing every future capture tick forever with zero
// user-visible feedback ("black screen, doesn't respond"). Racing it against a plain timer
// means the app's own logic always gets control back, whether or not the native call ever does.
const CAPTURE_TIMEOUT_MS = 6000;
// Same protection for the JPEG decode step -- pure JS, no native camera hardware involved, so
// a much shorter bound than detection is enough.
const DECODE_TIMEOUT_MS = 5000;
// Longer than the other two -- deliberately: loadModelSkippingWarmup (vehicleDetection.ts)
// defers coco-ssd's one-time warmup inference onto whichever frame happens to be the *first*
// one actually run through detectVehiclesInPhoto, specifically so the loading screen itself
// doesn't have to wait for it. That means this one call can legitimately take much longer than
// a normal frame on a slow/CPU-only device -- a short timeout here would misfire on totally
// healthy first-frame behavior, not a real hang.
const DETECT_TIMEOUT_MS = 15000;
// Consecutive capture failures (timeouts or thrown errors) before giving up and surfacing the
// existing error+Retry UI instead of quietly retrying forever -- one bad frame shouldn't error
// out immediately (real, temporary hiccups happen), but a real, ongoing problem should always
// end up somewhere the user can see and act on, never an indefinitely stuck screen.
const MAX_CONSECUTIVE_CAPTURE_FAILURES = 4;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

interface Props {
  onClose: () => void;
  // True whenever a route is active in the background -- used to ease off capture cadence (see
  // CAPTURE_INTERVAL_MS_NAVIGATING). This screen used to also draw a route overlay while
  // navigating, removed per explicit request: it covered too much of the frame to actually
  // point a camera at nearby vehicles through, which is the entire point of this screen.
  isNavigating?: boolean;
}

export function VehicleDetectionScreen({ onClose, isNavigating = false }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<"loading-model" | "running" | "error">("loading-model");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [boxes, setBoxes] = useState<TrackedBox[]>([]);
  const [photoSize, setPhotoSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  // Plate text (plus the real estimated region it was actually cropped from -- see
  // plateLocator.ts -- so the on-screen frame can be sized/positioned to the real plate instead
  // of a generic floating label) is display-only -- keyed by track id, never written anywhere
  // but this component's own state, cleared the moment a vehicle's track is pruned (see below).
  // Nothing here is persisted or sent off-device.
  const [plateTexts, setPlateTexts] = useState<Map<number, { text: string; region: PlateRegion }>>(
    new Map()
  );
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
  const plateTextsRef = useRef(new Map<number, { text: string; region: PlateRegion }>());
  const consecutiveFailuresRef = useRef(0);

  const [retryCount, setRetryCount] = useState(0);
  const retryLoad = useCallback(() => {
    consecutiveFailuresRef.current = 0;
    // A stuck/timed-out capture is exactly the kind of failure Retry needs to actually clear --
    // without this, a genuinely hung previous capture would leave this permanently true and
    // silently block every capture tick after "retrying" too, same as before Retry was pressed.
    capturingRef.current = false;
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
      // skipProcessing was here for capture speed, but expo-camera's own docs are explicit
      // about the real cost: "enabling skipProcessing would cause orientation uncertainty...
      // the obtained image would be displayed wrongly (rotated by 90°, 180°, or 270°)."
      // Detection runs on the raw, unrotated pixel buffer while the box/plate overlay math
      // below assumes it matches the portrait preview orientation -- confirmed root cause of
      // boxes not accurately squaring up on the actual vehicle. skipProcessing also silently
      // discarded the `quality` option entirely ("If enabled, quality option is discarded"),
      // so removing it makes `quality: 0.4` actually take effect for the first time, which
      // should offset some of the added capture latency from real, correctly-oriented
      // processing.
      const photo = await withTimeout(
        cameraRef.current.takePictureAsync({ quality: 0.4 }),
        CAPTURE_TIMEOUT_MS,
        "takePictureAsync"
      );
      if (!photo || unmountedRef.current) return;
      consecutiveFailuresRef.current = 0;
      Sentry.logger.info("vehicle-detection: photo captured", { width: photo.width, height: photo.height });
      setPhotoSize({ width: photo.width, height: photo.height });
      const decoded = await withTimeout(
        decodePhotoForDetection(photo.uri),
        DECODE_TIMEOUT_MS,
        "decodePhotoForDetection"
      );
      if (unmountedRef.current) return;
      const detected = await withTimeout(detectVehiclesInPhoto(decoded), DETECT_TIMEOUT_MS, "detectVehiclesInPhoto");
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
            plateTextsRef.current.set(trackId, { text, region });
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
      Sentry.logger.error("vehicle-detection: capture/detect failed", { error: String(err) });
      if (unmountedRef.current) return;
      consecutiveFailuresRef.current += 1;
      // A single bad frame is normal (a real hiccup, not a real problem) and just gets silently
      // retried on the next tick -- only surface the error+Retry UI once it's clearly not a
      // one-off, so the screen never sits indefinitely frozen with zero feedback ("black screen,
      // doesn't respond") but also doesn't flash an error over one missed frame.
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_CAPTURE_FAILURES) {
        Sentry.logger.error("vehicle-detection: giving up after repeated capture failures", {
          consecutiveFailures: consecutiveFailuresRef.current,
        });
        setErrorMessage("Vehicle detection stalled -- tap Retry to restart it.");
        setStatus("error");
      }
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

  // useCameraPermissions() reports its result as null until the async permission check
  // resolves -- this used to just return an empty black View with genuinely nothing else on
  // it, no Close, no spinner, no way out. If that check is ever slow (or, on some real device/
  // OS combination, never actually resolves), this was a real, confirmed dead end: a
  // permanently blank black screen with zero UI, not caught by the render error boundary
  // because nothing here ever throws -- it just never renders anything. Always giving this
  // state a spinner + a working Close means there is never a state this screen can render
  // that has no way out.
  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.permissionText}>Checking camera access…</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.closeLink}>Close</Text>
        </Pressable>
      </View>
    );
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
          const plateInfo = plateTexts.get(box.id);
          const speedLabel =
            box.state === "parked"
              ? "PARKED"
              : box.speedKmh === null
                ? null
                : Math.abs(box.speedKmh) < 3
                  ? "steady"
                  : `${box.speedKmh > 0 ? "▲" : "▼"} ${Math.round(Math.abs(box.speedKmh))} km/h`;
          return (
            <React.Fragment key={box.id}>
              <Pressable
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
              {/* Plate text only ever appears once on-device OCR actually confirms a real read
                  (see plateOcr.ts) -- never a location guess with nothing behind it, and never
                  stored or sent anywhere, just held in this screen's own state for as long as
                  the vehicle stays tracked. The frame itself is the *real* estimated plate
                  rectangle (plateLocator.ts's region, the same crop OCR actually read from) in
                  its own real position, not a generic label floating under the vehicle box --
                  rendered as a sibling of the vehicle box (not nested in it) since the plate
                  region has its own independent coordinates in the source photo. */}
              {plateInfo && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.plateFrame,
                    {
                      left: plateInfo.region.x * scale + offsetX,
                      top: plateInfo.region.y * scale + offsetY,
                      width: plateInfo.region.w * scale,
                      height: plateInfo.region.h * scale,
                    },
                  ]}
                >
                  <View style={styles.plateFrameLabelWrap}>
                    <Text style={styles.plateFrameLabelText} numberOfLines={1}>
                      {plateInfo.text}
                    </Text>
                  </View>
                </View>
              )}
            </React.Fragment>
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
  // Sized/positioned to the real estimated plate rectangle (see the render call site) -- an
  // exact frame around the actual plate, not a generic fixed-size badge floating near it.
  plateFrame: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#22D3EE",
    borderRadius: 3,
  },
  plateFrameLabelWrap: {
    position: "absolute",
    bottom: -24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  plateFrameLabelText: {
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
