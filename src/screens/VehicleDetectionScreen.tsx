import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, LayoutChangeEvent } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  type PhotoFile,
} from "react-native-vision-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import { detectVehiclesInPhoto, decodePhotoForDetection, warmUpModel } from "@/services/vehicleDetection";
import { sampleLightbarActivity, pruneLightbarTracks } from "@/utils/lightbarDetector";
import { createSpeedTracker, type TrackedBox } from "@/utils/speedTracker";
import { locatePlateRegion, type PlateRegion } from "@/utils/plateLocator";
import { readPlateText } from "@/services/plateOcr";
import { useLocation } from "@/context/LocationContext";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import { Sentry } from "@/services/sentry";

// takePhoto() is a discrete photo shutter (not a continuous frame stream the way a real Frame
// Processor pipeline would be -- this app deliberately doesn't use vision-camera's Frame
// Processors, since the on-device model here runs on tfjs (services/vehicleDetection.ts),
// which isn't something a Frame Processor's restricted worklet runtime can call into without
// swapping the inference engine itself, a much bigger separate project). A capture already in
// flight just makes the next tick a no-op (see capturingRef below) rather than stacking, so on
// a device where one real capture+decode+detect cycle takes longer than this interval, this
// number doesn't actually change the real cadence at all -- capturingRef already caps it to
// however long a cycle genuinely takes. Where it DOES matter is a faster device that finishes
// well under this interval: raised from 700ms after repeated real freeze reports specifically
// to leave more genuine idle time between captures for touch handling (Close, zoom buttons) to
// get a turn on the JS thread, at the cost of a slightly less "continuous" feel.
const CAPTURE_INTERVAL_MS = 900;
// While actively navigating, the map screen underneath is also live (GPS tracking, guidance,
// voice) and this screen's own tfjs CPU inference is already the heaviest thing running --
// a slower cadence here is a real, deliberate trade-off for headroom during exactly the
// condition that was crashing/black-screening this screen before (see MapScreen's
// detectionOpen gating of its own camera-animation effects for the other half of that fix).
const CAPTURE_INTERVAL_MS_NAVIGATING = 1400;
// Attempts (each tied to one capture pass, ~1.2s apart) before giving up on a persistently
// unreadable plate for a given track -- caps total OCR work per vehicle instead of retrying
// forever on one that's obscured, too far, or at a bad angle.
const MAX_PLATE_ATTEMPTS = 6;
// On-device ML Kit text recognition (rn-mlkit-ocr) doesn't expose a per-read numeric
// confidence score at all -- so instead of a fabricated confidence number, a plate only ever
// gets shown once the SAME text has actually been read at least twice within its last few
// attempts, a real, direct way to reject a one-off misread before it's ever displayed.
const PLATE_CANDIDATE_WINDOW = 3;
const PLATE_CONFIRM_COUNT = 2;
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
// Remembers that the driver already closed the "how detection works" explainer -- previously
// this banner had no dismiss control at all on mobile (unlike the web app's equivalent, which
// does), so it stayed pinned across the whole detection view every single time it was opened.
const INFO_DISMISSED_KEY = "@trackline/aiDetectionInfoDismissed";

// Four corner brackets instead of a plain solid rectangle -- reads as a real targeting
// lock (the same visual language as a camera's autofocus/tracking reticle) rather than a
// generic selection outline, per explicit request for the box to look "professionally
// placed/locked." Purely cosmetic on top of the same real bbox math below -- the actual
// detected region a bracket set outlines is unchanged.
function TargetCorners({ width, height, color }: { width: number; height: number; color: string }) {
  const len = Math.max(10, Math.min(22, Math.min(width, height) * 0.3));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.corner, styles.cornerTL, { width: len, height: len, borderColor: color }]} />
      <View style={[styles.corner, styles.cornerTR, { width: len, height: len, borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBL, { width: len, height: len, borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBR, { width: len, height: len, borderColor: color }]} />
    </View>
  );
}

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

// vision-camera's PhotoFile.path is a bare filesystem path ("/var/mobile/..."), not a URI --
// unlike expo-camera's photo.uri, which always came back with the file:// scheme already on
// it. Both expo-file-system's File and expo-image-manipulator expect a real URI, so this adds
// the scheme back on rather than assuming every caller downstream already handles a bare path.
function toFileUri(path: string): string {
  return path.startsWith("file://") ? path : `file://${path}`;
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
  // Diagnostic timing only (see the Sentry "perf:" breadcrumbs throughout this file) -- not
  // used for any real logic. Marks when this component first rendered, so onInitialized below
  // can report how long the native camera session genuinely took to come up.
  const mountTimeRef = useRef(Date.now());
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  // A phone's default/max photo resolution is often 12MP+ (4032x3024 or bigger) -- the
  // detection model only ever looks at a downsized 300x300 tensor, so capturing at full
  // resolution was pure waste: a bigger native JPEG to encode, a bigger file to write/delete
  // every ~0.7-1.1s, a bigger buffer to decode, more pixels for tf.tensor3d to allocate. Cut
  // again from 960x540 down to 640x360 after repeated real freeze reports -- the SSD model's
  // own forward pass cost is fixed either way (it always resizes its input down to 300x300
  // internally regardless of what's fed in), but the JPEG decode + tensor allocation/copy this
  // app does on every single capture scales directly with pixel count, and that step runs on
  // the same JS thread as touch handling -- a real, direct, now twice-cut source of the
  // "freezes while detecting" symptom. 640x360 still only ever gets downscaled by the model
  // (never upscaled -- both dimensions stay above 300px), so this doesn't introduce upscaling
  // artifacts, just less spare detail beyond what 300x300 needs.
  const format = useCameraFormat(device, [{ photoResolution: { width: 640, height: 360 } }]);
  // Real camera zoom -- vision-camera's `zoom` prop drives the actual native capture session
  // (AVCaptureDevice/CameraX), not just the on-screen preview, so takePhoto() genuinely
  // captures the zoomed-in frame. That directly helps detection on a distant vehicle: more of
  // the frame's pixels land on it instead of the model trying to work with a tiny cluster of
  // pixels lost in a wide field of view. Capped below device.maxZoom (some devices report up
  // to 128x, which is unusable digital zoom that just produces a blurry, undetectable frame)
  // and starts at the device's own neutralZoom (1x on a single-camera device; the wide-angle
  // "normal" zoom on a multi-camera one -- never starts on the ultra-wide fish-eye lens, which
  // would distort vehicles and hurt detection, not help it).
  const MAX_USABLE_ZOOM = 8;
  const [zoomFactor, setZoomFactor] = useState(1);
  useEffect(() => {
    if (device) setZoomFactor(device.neutralZoom);
  }, [device]);
  const minZoomFactor = device?.minZoom ?? 1;
  const maxZoomFactor = device ? Math.min(device.maxZoom, MAX_USABLE_ZOOM) : 1;
  const zoomIn = useCallback(() => {
    setZoomFactor((z) => Math.min(maxZoomFactor, Math.round((z + 0.5) * 10) / 10));
  }, [maxZoomFactor]);
  const zoomOut = useCallback(() => {
    setZoomFactor((z) => Math.max(minZoomFactor, Math.round((z - 0.5) * 10) / 10));
  }, [minZoomFactor]);
  // Real ego GPS speed for turning a tracked vehicle's closing/receding rate into its own
  // actual road speed -- see speedTracker.ts's combineWithEgoSpeed. Reuses the SAME
  // app-wide location watcher LocationProvider already runs (App.tsx) rather than starting a
  // second GPS subscription just for this screen, so there's nothing extra to tear down here.
  const { location } = useLocation();
  const egoSpeedRef = useRef<number | null>(null);
  egoSpeedRef.current = location?.coords.speed ?? null;
  // No "error" state -- see the model-load effect and captureAndDetect's catch block below.
  // Every failure mode here now auto-recovers on its own instead of ever stopping and waiting
  // on a manual tap.
  const [status, setStatus] = useState<"loading-model" | "running">("loading-model");
  // >0 once the model has failed to load at least once -- only changes the loading text to be
  // honest that it's taking a retry or two, never blocks anything or asks for a tap.
  const [modelLoadAttempt, setModelLoadAttempt] = useState(0);
  // True only while capture/detect has been failing for a few ticks in a row -- a small,
  // non-blocking "Reconnecting…" indicator, not a dead end. Clears itself the instant a
  // capture actually succeeds again (see captureAndDetect's success path below).
  const [recovering, setRecovering] = useState(false);
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

  const cameraRef = useRef<Camera>(null);
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
  // Last few raw OCR reads per track id, oldest first (capped to PLATE_CANDIDATE_WINDOW) --
  // see PLATE_CANDIDATE_WINDOW/PLATE_CONFIRM_COUNT's own comment for why this exists.
  const plateCandidatesRef = useRef(new Map<number, string[]>());
  // Mirrors `plateTexts` state so captureAndDetect can check it without depending on the
  // state itself -- keeps captureAndDetect referentially stable (empty deps), so the capture
  // interval effect below doesn't tear down and rebuild every time a plate read resolves.
  const plateTextsRef = useRef(new Map<number, { text: string; region: PlateRegion }>());
  const consecutiveFailuresRef = useRef(0);

  const [infoDismissed, setInfoDismissed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const tStart = Date.now();
    AsyncStorage.getItem(INFO_DISMISSED_KEY).then((value) => {
      Sentry.logger.info("perf: vehicleDetectionScreen.infoDismissedRead", { ms: Date.now() - tStart });
      if (!cancelled && value === "1") setInfoDismissed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const dismissInfo = useCallback(() => {
    setInfoDismissed(true);
    AsyncStorage.setItem(INFO_DISMISSED_KEY, "1").catch(() => {});
  }, []);

  // Auto-retries forever with a capped backoff instead of ever dead-ending on a manual "tap
  // Retry" button -- a transient hiccup (a slow first disk read, a momentary GC pause) resolves
  // itself within a couple of attempts with zero user action needed; a persistent one just
  // keeps trying quietly in the background for as long as the screen stays open, which is the
  // most this screen can honestly do without ever leaving the driver stuck looking at a dead
  // end. modelLoadAttempt only changes the loading text (see the banner below), never gates
  // anything.
  const MODEL_LOAD_RETRY_DELAYS_MS = [1500, 3000, 6000, 10000];
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attemptLoad = () => {
      warmUpModel()
        .then(() => {
          if (!cancelled) setStatus("running");
        })
        .catch((err) => {
          if (cancelled) return;
          Sentry.logger.error("vehicle-detection: model load failed, auto-retrying", {
            attempt,
            error: err instanceof Error ? err.message : String(err),
          });
          attempt += 1;
          setModelLoadAttempt(attempt);
          const delay =
            MODEL_LOAD_RETRY_DELAYS_MS[Math.min(attempt - 1, MODEL_LOAD_RETRY_DELAYS_MS.length - 1)];
          timer = setTimeout(attemptLoad, delay);
        });
    };
    attemptLoad();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const captureAndDetect = useCallback(async () => {
    if (capturingRef.current || unmountedRef.current || !cameraRef.current) return;
    capturingRef.current = true;
    // Diagnostic timing only, per explicit instruction: instrument every real step of this
    // cycle and report actual numbers before touching detection logic/timing/resolution
    // again. Every tCycleStart-relative delta below is logged as a Sentry "perf:" breadcrumb
    // (visible in Sentry's issue/breadcrumb view for a real session, including TestFlight --
    // console.time wouldn't be, since there's no attached debugger on a TestFlight install).
    const tCycleStart = Date.now();
    try {
      // vision-camera's takePhoto() is a real, lower-overhead native capture than expo-
      // camera's takePictureAsync() was -- no explicit quality knob here (that's the
      // <Camera>'s own photoQualityBalance="speed" prop below instead), and orientation is
      // handled correctly by default (no skipProcessing-style footgun to worry about).
      // enableShutterSound: false since this fires repeatedly every ~0.7-1.1s for as long as
      // the screen is open -- a real camera shutter click on every one of those would be a
      // real, confirmed annoyance, not a bug fix.
      const photoFile: PhotoFile = await withTimeout(
        cameraRef.current.takePhoto({ enableShutterSound: false }),
        CAPTURE_TIMEOUT_MS,
        "takePhoto"
      );
      const tCaptured = Date.now();
      if (!photoFile || unmountedRef.current) return;
      const photo = { uri: toFileUri(photoFile.path), width: photoFile.width, height: photoFile.height };
      Sentry.logger.info("perf: vehicleDetectionScreen.takePhoto", {
        ms: tCaptured - tCycleStart,
        width: photo.width,
        height: photo.height,
      });
      setPhotoSize({ width: photo.width, height: photo.height });
      const decoded = await withTimeout(
        decodePhotoForDetection(photo.uri),
        DECODE_TIMEOUT_MS,
        "decodePhotoForDetection"
      );
      const tDecoded = Date.now();
      Sentry.logger.info("perf: vehicleDetectionScreen.decode", { ms: tDecoded - tCaptured });
      if (unmountedRef.current) return;
      const detected = await withTimeout(detectVehiclesInPhoto(decoded), DETECT_TIMEOUT_MS, "detectVehiclesInPhoto");
      const tDetected = Date.now();
      Sentry.logger.info("perf: vehicleDetectionScreen.detect", { ms: tDetected - tDecoded });
      if (unmountedRef.current) return;
      // Reset only once the whole real pipeline (shutter + decode + model inference) has
      // actually succeeded -- resetting this right after takePhoto (as it used to) meant a
      // camera that keeps shuttering fine while decode/detect silently keeps throwing every
      // single time could never accumulate MAX_CONSECUTIVE_CAPTURE_FAILURES failures, so a
      // persistent problem could never even get flagged as "reconnecting" below.
      consecutiveFailuresRef.current = 0;
      setRecovering(false);
      const tracked = speedTrackerRef.current.update(detected, photo.width, Date.now(), egoSpeedRef.current);
      setBoxes(tracked);
      // Measures the synchronous call-site cost of tracker.update + queuing the setState calls
      // below -- NOT the actual React commit/re-render, which happens asynchronously on React's
      // own schedule and isn't directly measurable from here without a native perf module. A
      // large number here would mean the tracker math itself is slow; a small number here with
      // a real freeze still happening points at the render/commit itself, or at React batching
      // this update behind the next heavy synchronous block (this same function's own next
      // iteration) rather than getting a chance to paint in between.
      const tTrackerUpdate = Date.now();
      Sentry.logger.info("perf: vehicleDetectionScreen.trackerUpdateAndSetBoxes", {
        ms: tTrackerUpdate - tDetected,
      });

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
      Sentry.logger.info("perf: vehicleDetectionScreen.lightbarCheck", {
        ms: Date.now() - tTrackerUpdate,
        vehicleCount: tracked.length,
      });

      // Prune cached plate state for any track id the tracker has fully dropped (not just
      // ones missing from this frame's `tracked` -- a track survives a short grace period on
      // a single missed detection, and pruning off `tracked` alone would wipe a legitimately
      // in-progress read on that miss).
      for (const id of plateAttemptsRef.current.keys()) {
        if (!liveIds.has(id)) plateAttemptsRef.current.delete(id);
      }
      for (const id of plateCandidatesRef.current.keys()) {
        if (!liveIds.has(id)) plateCandidatesRef.current.delete(id);
      }
      let pruned = false;
      for (const id of plateTextsRef.current.keys()) {
        if (!liveIds.has(id)) {
          plateTextsRef.current.delete(id);
          pruned = true;
        }
      }
      if (pruned) setPlateTexts(new Map(plateTextsRef.current));

      // Collected so the captured photo file (below) is only deleted once every plate-read
      // that still needs to read bytes off it has actually finished -- readPlateText crops
      // straight from photo.uri, so deleting it any earlier would race that read.
      const plateReadPromises: Promise<void>[] = [];
      for (const box of tracked) {
        if (plateTextsRef.current.has(box.id) || platesReadingRef.current.has(box.id)) continue;
        const attempts = plateAttemptsRef.current.get(box.id) ?? 0;
        if (attempts >= MAX_PLATE_ATTEMPTS) continue;
        const region = locatePlateRegion(box.bbox);
        if (!region) continue;

        plateAttemptsRef.current.set(box.id, attempts + 1);
        platesReadingRef.current.add(box.id);
        const trackId = box.id;
        const tPlateStart = Date.now();
        plateReadPromises.push(
          readPlateText(photo.uri, region)
            .then((text) => {
              // Runs concurrently with the next capture cycle (never awaited inline), but its
              // own crop+OCR work still lands on the JS thread when this .then() fires -- for
              // multiple vehicles in frame, these can stack up between capture cycles. Real
              // number to check: is this ever running for more than one vehicle at a time, and
              // does that overlap with a reported freeze.
              Sentry.logger.info("perf: vehicleDetectionScreen.plateOcr", {
                ms: Date.now() - tPlateStart,
                trackId,
                found: !!text,
              });
              if (!text || unmountedRef.current) return;
              // Confirm before ever showing anything -- see PLATE_CANDIDATE_WINDOW's own
              // comment. A single successful read (even one that matched the plate-shaped
              // regex) isn't shown until the same text has come up at least
              // PLATE_CONFIRM_COUNT times within its last PLATE_CANDIDATE_WINDOW attempts, so
              // one misread on an otherwise-correctly-read plate can't flicker a wrong string
              // onto the screen even briefly.
              const history = plateCandidatesRef.current.get(trackId) ?? [];
              history.push(text);
              if (history.length > PLATE_CANDIDATE_WINDOW) history.shift();
              plateCandidatesRef.current.set(trackId, history);

              const counts = new Map<string, number>();
              for (const candidate of history) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
              let confirmedText: string | null = null;
              for (const [candidate, count] of counts) {
                if (count >= PLATE_CONFIRM_COUNT) confirmedText = candidate;
              }
              if (!confirmedText) return;

              plateTextsRef.current.set(trackId, { text: confirmedText, region });
              setPlateTexts(new Map(plateTextsRef.current));
            })
            .catch((err) => {
              Sentry.logger.error("vehicle-detection: plate OCR failed", { error: String(err) });
              console.warn("[vehicle-detection] plate OCR failed", err);
            })
            .finally(() => platesReadingRef.current.delete(trackId))
        );
      }

      // Every capture (every ~0.7-1.1s) writes a brand-new temp JPEG that isn't reliably
      // cleaned up on its own -- vision-camera's own docs are explicit that a captured photo
      // "might get deleted once the app closes," not before, same as expo-camera's captures
      // before it. Left alone, a normal multi-minute driving session leaked hundreds of files
      // onto disk, a real, confirmed contributor to this screen eventually crashing under
      // storage/memory pressure. Deleted once decode + every plate crop that reads from it
      // this tick have actually finished (best-effort -- a failed cleanup here is silently
      // swallowed, never surfaced as a detection failure).
      const capturedUri = photo.uri;
      Promise.allSettled(plateReadPromises).finally(() => {
        try {
          new File(capturedUri).delete();
        } catch {}
      });
      // The real number to compare against the capture interval (900ms/1400ms) -- if this
      // regularly exceeds the interval, capturingRef's own guard means the real-world cadence
      // is already however long this is, regardless of what the interval constant says.
      Sentry.logger.info("perf: vehicleDetectionScreen.totalCycle", {
        ms: Date.now() - tCycleStart,
        vehicleCount: tracked.length,
      });
    } catch (err) {
      console.warn("[vehicle-detection] capture/detect failed", err);
      Sentry.logger.error("vehicle-detection: capture/detect failed", { error: String(err) });
      if (unmountedRef.current) return;
      consecutiveFailuresRef.current += 1;
      // A single bad frame is normal (a real hiccup, not a real problem) and just gets silently
      // retried on the next tick with no visible change at all. Only once it's clearly not a
      // one-off does a small, non-blocking "Reconnecting…" indicator appear (see the render
      // below) -- the capture loop itself never stops or waits on anything here, so there's
      // nothing for the driver to tap; it clears itself the moment a capture actually succeeds
      // again.
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_CAPTURE_FAILURES) {
        Sentry.logger.error("vehicle-detection: repeated capture failures, still retrying", {
          consecutiveFailures: consecutiveFailuresRef.current,
        });
        setRecovering(true);
      }
    } finally {
      capturingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    const intervalMs = isNavigating ? CAPTURE_INTERVAL_MS_NAVIGATING : CAPTURE_INTERVAL_MS;
    // Deliberately does NOT fire the first capture immediately -- the very first real capture
    // is also the single heaviest one, since coco-ssd's one-time graph warmup (skipped during
    // loading specifically so this screen appears instantly, see vehicleDetection.ts) lands on
    // whichever capture happens to run first. Firing that immediately, right at the exact
    // moment the screen becomes interactive, means the heaviest possible CPU burst hits at the
    // most visible moment -- exactly when it reads as "frozen, doesn't load" instead of
    // "detecting." Letting setInterval's own first tick handle it gives the camera session and
    // UI a real beat to settle first.
    intervalRef.current = setInterval(captureAndDetect, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, captureAndDetect, isNavigating]);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ width, height });
  }, []);

  // vision-camera's useCameraPermission() reads the native permission status synchronously
  // (unlike expo-camera's async-only useCameraPermissions(), which had a real "still checking,
  // null" state this screen used to have to guard against with its own dedicated loading
  // branch) -- hasPermission is always a real boolean from the very first render, so there's
  // no equivalent indeterminate state left to handle here.
  if (!hasPermission) {
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

  // Real absent-hardware/still-enumerating state (vision-camera's device list can briefly be
  // empty right after the native module initializes) -- same "always a working Close, never a
  // dead-end blank screen" principle as the permission screens above.
  if (!device) {
    return (
      <View style={styles.permissionContainer}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.permissionText}>Looking for a camera…</Text>
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

  // Tapping a locked box opens this detail panel -- every field below is read straight off
  // that vehicle's own live tracked state (the same `boxes`/`plateTexts`/`emergencyTrackIds`
  // the boxes themselves render from), never re-queried or recomputed separately, so it can
  // never show something different from what's actually on screen.
  const selectedBox = selectedTrackId !== null ? boxes.find((b) => b.id === selectedTrackId) : undefined;
  const selectedPlate = selectedTrackId !== null ? plateTexts.get(selectedTrackId) : undefined;
  const selectedIsEmergency = selectedTrackId !== null && emergencyTrackIds.has(selectedTrackId);

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {/* isActive stays true for as long as this component is mounted -- the Modal fix in
          MapScreen.tsx already guarantees a real unmount (camera session torn down along with
          everything else) on Close, so there's no separate "pause the session" state needed
          here. */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={true}
        photo={true}
        photoQualityBalance="speed"
        zoom={zoomFactor}
        onInitialized={() =>
          Sentry.logger.info("perf: vehicleDetectionScreen.cameraInitialized", {
            ms: Date.now() - mountTimeRef.current,
          })
        }
        onError={(error) =>
          Sentry.logger.error("vehicle-detection: camera runtime error", {
            code: error.code,
            message: error.message,
          })
        }
      />

      {/* Real zoom -- changes the actual native capture session (see zoomFactor's own
          comment above), so this isn't just a cosmetic preview crop: takePhoto() genuinely
          captures the zoomed-in frame, giving the detector more real pixels on a distant
          vehicle. Disabled (dimmed) at each end instead of silently no-op'ing so it's clear
          when you've hit the device's real min/max. */}
      <View style={[styles.zoomControls, { top: insets.top + spacing.md + 140 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.zoomButton,
            zoomFactor >= maxZoomFactor && styles.zoomButtonDisabled,
            pressed && zoomFactor < maxZoomFactor && { opacity: pressedOpacity },
          ]}
          onPress={zoomIn}
          disabled={zoomFactor >= maxZoomFactor}
          accessibilityLabel="Zoom in"
          hitSlop={8}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.zoomLabel}>{zoomFactor.toFixed(1)}x</Text>
        <Pressable
          style={({ pressed }) => [
            styles.zoomButton,
            zoomFactor <= minZoomFactor && styles.zoomButtonDisabled,
            pressed && zoomFactor > minZoomFactor && { opacity: pressedOpacity },
          ]}
          onPress={zoomOut}
          disabled={zoomFactor <= minZoomFactor}
          accessibilityLabel="Zoom out"
          hitSlop={8}
        >
          <Ionicons name="remove" size={20} color="#FFFFFF" />
        </Pressable>
      </View>


      {photoSize &&
        containerSize &&
        boxes.map((box) => {
          const [x, y, w, h] = box.bbox;
          const isEmergency = emergencyTrackIds.has(box.id);
          const isSelected = selectedTrackId === box.id;
          const plateInfo = plateTexts.get(box.id);
          // "absolute" -- ego GPS speed was available, so this is a real estimate of the
          // OTHER vehicle's own road speed (see speedTracker.ts's combineWithEgoSpeed),
          // exactly what this label is meant to answer. "closing" -- no ego speed to combine
          // with, so this is only the closing/receding rate between the two vehicles, labeled
          // with an explicit arrow (never presented as the vehicle's real speed) so it isn't
          // mistaken for the same thing. Never a fabricated number either way -- null shows
          // nothing at all.
          const speedLabel =
            box.state === "parked"
              ? "0 km/h"
              : box.speedKmh === null
                ? null
                : box.speedKind === "absolute"
                  ? `${Math.max(0, Math.round(box.speedKmh))} km/h`
                  : Math.abs(box.speedKmh) < 3
                    ? "steady"
                    : `${box.speedKmh > 0 ? "▲" : "▼"} ${Math.round(Math.abs(box.speedKmh))} km/h`;
          const boxWidthPx = w * scale;
          const boxHeightPx = h * scale;
          const lockColor = isEmergency ? "#DC2626" : isSelected ? "#22D3EE" : "#F59E0B";
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
                    width: boxWidthPx,
                    height: boxHeightPx,
                  },
                ]}
              >
                <TargetCorners width={boxWidthPx} height={boxHeightPx} color={lockColor} />
                <Text style={[styles.boxLabel, isEmergency && styles.boxLabelEmergency]}>
                  {isEmergency ? `${box.label} — lights active` : `${box.label} ${Math.round(box.score * 100)}%`}
                </Text>
                {/* Top-center, just outside the box edge -- separate from the type/
                    confidence label at top-left so it never overlaps, and updates live every
                    frame the tracker emits a speed (at the screen's own capture cadence, see
                    CAPTURE_INTERVAL_MS/_NAVIGATING above). */}
                {speedLabel && (
                  <View style={styles.speedLabelWrap} pointerEvents="none">
                    <Text
                      style={[styles.speedLabel, box.state === "parked" && styles.speedLabelParked]}
                    >
                      {speedLabel}
                    </Text>
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
                  <TargetCorners
                    width={plateInfo.region.w * scale}
                    height={plateInfo.region.h * scale}
                    color="#22D3EE"
                  />
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

      {(status !== "running" || !infoDismissed) && (
      <View style={[styles.banner, { top: insets.top + spacing.md }]}>
        {status === "loading-model" && (
          <>
            <ActivityIndicator color="#fff" />
            {/* Loading is now just the model file fetch/cache (see vehicleDetection.ts's
                loadModelSkippingWarmup) -- the heavy warmup computation that used to block this
                screen was moved to land on the very first detected frame instead, so Close/
                Switch camera stay responsive here rather than fighting a busy JS thread. Past
                the first attempt this is honest that it's retrying, but never asks for a tap --
                see the auto-retry effect above. */}
            <Text style={styles.bannerText}>
              {modelLoadAttempt > 0
                ? "Still loading the detection model — retrying automatically…"
                : "Loading detection model…"}
            </Text>
          </>
        )}
        {status === "running" && !infoDismissed && (
          <>
            <Text style={styles.bannerText}>
              Detecting vehicles — amber target-lock box,
              generic "Vehicle"/"Heavy Vehicle". Turns red with "lights active" only once an
              actual strobing red/blue light is confirmed near the vehicle's own roofline for a
              few seconds — real detected evidence, not a guess at vehicle type (a
              marked/unmarked car with no lights on shows no different to any other car, the
              same way a driver wouldn't notice one either). Speed (top-center of box) shows a
              real km/h estimate of that vehicle's own road speed once your own GPS speed is
              available to combine with it (assumes it's ahead of you, same direction); with no
              GPS fix it falls back to an arrow + closing/receding rate instead, and shows
              "0 km/h" once a vehicle has been still for a couple of seconds. A plate number
              only appears once the same on-device text read comes back at least twice in a
              row — it's never stored or sent anywhere, just shown live while that vehicle
              stays in view. Tap any box for its full details. Use +/- on the right to zoom in
              on a distant vehicle — this zooms the real camera capture, not just the preview,
              so it can genuinely help detect something too far away to register at 1x.
            </Text>
            <Pressable onPress={dismissInfo} hitSlop={12} accessibilityLabel="Dismiss">
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </>
        )}
      </View>
      )}

      {/* Small, non-blocking "still working on it" indicator -- never a dead end, never asks
          for a tap. Only shown once the explainer banner above is out of the way (same top
          offset -- recovering can only become true while status is "running", so the banner is
          only still up here if it hasn't been dismissed yet) and clears itself the instant a
          capture actually succeeds again. */}
      {recovering && infoDismissed && (
        <View style={[styles.recoveringPill, { top: insets.top + spacing.md }]}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.recoveringPillText}>Reconnecting to camera…</Text>
        </View>
      )}

      {/* Detail panel for whichever box is tapped (see onSelectBox) -- speed/plate/type/
          emergency status, all read live off the same tracked state the boxes themselves use.
          Tapping the same box again (or its own close) clears the selection, same as tapping
          it once already does for the on-box highlight. */}
      {selectedBox && (
        <View style={[styles.detailPanel, { bottom: insets.bottom + spacing.xl + 64 }]}>
          <View style={styles.detailPanelHeader}>
            <Text style={styles.detailPanelTitle}>{selectedBox.label}</Text>
            <Pressable onPress={() => setSelectedTrackId(null)} hitSlop={10} accessibilityLabel="Close vehicle details">
              <Ionicons name="close" size={18} color="#9CA3AF" />
            </Pressable>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Speed</Text>
            <Text style={styles.detailValue}>
              {selectedBox.state === "parked"
                ? "0 km/h"
                : selectedBox.speedKmh === null
                  ? "—"
                  : selectedBox.speedKind === "absolute"
                    ? `${Math.max(0, Math.round(selectedBox.speedKmh))} km/h`
                    : `${Math.round(Math.abs(selectedBox.speedKmh))} km/h closing`}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Plate</Text>
            <Text style={styles.detailValue}>{selectedPlate?.text ?? "Not read yet"}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Emergency lights</Text>
            <Text style={[styles.detailValue, selectedIsEmergency && styles.detailValueAlert]}>
              {selectedIsEmergency ? "Active" : "None detected"}
            </Text>
          </View>
        </View>
      )}

      {/* Only control left at the bottom now that Switch Camera is gone (per explicit request
          -- it also removed the whole facing-switch-mid-capture crash risk category with it).
          A transparent circular X (not a solid white pill) so it reads as a real camera-
          overlay exit control rather than a floating opaque button competing with the actual
          vehicle boxes for attention. */}
      <Pressable
        style={({ pressed }) => [
          styles.closeButton,
          { bottom: insets.bottom + spacing.xl },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={onClose}
        accessibilityLabel="Close vehicle detection"
        hitSlop={12}
      >
        <Ionicons name="close" size={26} color="#FFFFFF" />
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
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  corner: {
    position: "absolute",
    borderColor: "#F59E0B",
  },
  cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3 },
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
  speedLabelWrap: {
    position: "absolute",
    top: -22,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  speedLabel: {
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
  // On top of the plate's own target rectangle (not below it) -- reads as a real label
  // tagging the locked-on plate, per explicit request.
  plateFrameLabelWrap: {
    position: "absolute",
    top: -24,
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
  recoveringPill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    borderRadius: radius.pill,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  recoveringPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  detailPanel: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: "rgba(17, 24, 39, 0.94)",
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.high,
  },
  detailPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },
  detailPanelTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  detailLabel: {
    color: "#9CA3AF",
    fontSize: 13,
  },
  detailValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  detailValueAlert: {
    color: "#F87171",
  },
  closeButton: {
    position: "absolute",
    alignSelf: "center",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomControls: {
    position: "absolute",
    right: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomButtonDisabled: {
    opacity: 0.35,
  },
  zoomLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
});
