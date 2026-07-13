import { useEffect, useRef, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { createSpeedTracker } from "@/utils/speedTracker";
import { sampleLightbarActivity, pruneLightbarTracks } from "@/utils/lightbarDetector";
import { locatePlate } from "@/utils/plateLocator";
import { warmUpPlateOcr, readPlateText } from "@/services/plateOcr";
import {
  warmUpClassifier,
  classifyVehicleCrop,
  type ClassificationResult,
  type VehicleClass,
} from "@/services/vehicleClassifier";
import { normalizeAngleDeg, formatDistance } from "@/utils/navFormat";
import { NavActionsRow } from "@/components/NavActionsRow";
import "./LiveVehicleDetection.css";

// COCO-SSD (the pretrained model this runs) only knows generic COCO classes — it has no
// concept of "police car" or "ambulance", just "car" / "truck" / "bus" / "motorcycle". A
// second, custom-trained classifier (see training/README.md) runs behind it on each box to
// take a real guess at ambulance/firetruck/police-car -- trained on a modest ~500-image
// dataset, so it's shown as a confidence score, not a certified ID, and falls back to the
// generic "Vehicle" label whenever it isn't confident enough.
const VEHICLE_CLASSES = new Set(["car", "truck", "bus", "motorcycle"]);

// Cap detection passes instead of running one every single animation frame -- COCO-SSD
// inference (plus the per-box classifier and lightbar sampling riding on top of it) is heavy
// enough that running it unthrottled pegs the CPU/GPU the whole time this view is open, which
// is what actually reads as "lag" (jank, heat, battery drain) even though each individual
// frame renders fine. ~8 detections/sec is still smooth for bounding boxes that track a moving
// vehicle from a phone/laptop camera.
const MIN_DETECT_INTERVAL_MS = 120;

const CLASS_DISPLAY_NAMES: Record<VehicleClass, string> = {
  ambulance: "Ambulance",
  firetruck: "Fire truck",
  "police-car": "Police car",
  other: "Vehicle",
};

type FacingMode = "environment" | "user";

// Live nav info passed in only while navigation is active, so this view can show where to
// go without the driver needing to exit back to the map. The guide line is a schematic
// compass-bearing indicator (GPS bearing-to-next-turn vs. direction of travel), not true
// ground-projected AR — it's a real, physically-derived direction, just not photorealistic.
export interface DetectionNavContext {
  instructionText: string;
  distanceToManeuverM: number | null;
  etaText: string;
  arrivalClockText: string;
  distanceRemainingText: string;
  bearingToManeuverDeg: number | null;
  travelHeadingDeg: number;
  hideTrace: boolean;
  hasStop: boolean;
  onAddStop: () => void;
  onShareEta: () => void;
  onReportAlert: () => void;
}

interface Props {
  onClose: () => void;
  navContext?: DetectionNavContext | null;
}

// Quadratic bezier point + tangent, used to build a tapering ribbon instead of a single
// stroked line -- this is what actually reads as a flat strip lying on the ground receding
// into the distance (wide near the viewer, narrowing toward a vanishing point) rather than a
// line floating in space. Still a schematic GPS-bearing indicator, not true SLAM/ARKit ground
// tracking (this view has no depth/plane data to project onto) -- see the DetectionNavContext
// comment above -- but shaped to actually look like a road-level guide instead of an arrow.
function bezierPoint(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

function bezierTangent(p0: number, p1: number, p2: number, t: number): number {
  return 2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1);
}

function drawGuideRibbon(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  relativeAngleDeg: number,
  nowMs: number
) {
  const startX = canvasWidth / 2;
  const startY = canvasHeight;
  const clamped = Math.max(-90, Math.min(90, relativeAngleDeg));
  const t = clamped / 90; // -1..1
  const endX = canvasWidth / 2 + t * canvasWidth * 0.38;
  const endY = canvasHeight * 0.4;
  const controlX = canvasWidth / 2 + t * canvasWidth * 0.15;
  const controlY = canvasHeight * 0.75;

  const SEGMENTS = 24;
  const BASE_WIDTH = canvasWidth * 0.09;
  const TIP_WIDTH = canvasWidth * 0.012;
  const points: { x: number; y: number; nx: number; ny: number; width: number }[] = [];

  for (let i = 0; i <= SEGMENTS; i++) {
    const p = i / SEGMENTS;
    const x = bezierPoint(startX, controlX, endX, p);
    const y = bezierPoint(startY, controlY, endY, p);
    const dx = bezierTangent(startX, controlX, endX, p);
    const dy = bezierTangent(startY, controlY, endY, p);
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular unit normal to the direction of travel along the curve.
    const nx = -dy / len;
    const ny = dx / len;
    // Ease-out taper reads more like true perspective foreshortening than a linear narrow.
    const width = BASE_WIDTH + (TIP_WIDTH - BASE_WIDTH) * Math.sqrt(p);
    points.push({ x, y, nx, ny, width });
  }

  ctx.save();

  // The flat strip itself: a filled, tapering polygon (left edge out, right edge back),
  // not a stroked line -- this is what actually sells "lying on the ground" over "arrow".
  const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
  gradient.addColorStop(0, "rgba(37, 99, 235, 0.85)");
  gradient.addColorStop(1, "rgba(96, 165, 250, 0.35)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  points.forEach((pt, i) => {
    const lx = pt.x + pt.nx * (pt.width / 2);
    const ly = pt.y + pt.ny * (pt.width / 2);
    if (i === 0) ctx.moveTo(lx, ly);
    else ctx.lineTo(lx, ly);
  });
  for (let i = points.length - 1; i >= 0; i--) {
    const pt = points[i];
    const rx = pt.x - pt.nx * (pt.width / 2);
    const ry = pt.y - pt.ny * (pt.width / 2);
    ctx.lineTo(rx, ry);
  }
  ctx.closePath();
  ctx.fill();

  // Center-line lane ticks flowing toward the destination, animated by wall-clock time --
  // reinforces the "flat road surface" read instead of a floating tube.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = Math.max(2, canvasWidth * 0.006);
  ctx.lineCap = "round";
  ctx.setLineDash([canvasWidth * 0.02, canvasWidth * 0.035]);
  ctx.lineDashOffset = -((nowMs / 26) % (canvasWidth * 0.055));
  ctx.beginPath();
  points.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // A real destination marker (pin), not just an arrowhead -- the strip visibly connects to
  // a point, matching a turn/waypoint marker instead of trailing off into empty space.
  const pulse = 1 + 0.12 * Math.sin(nowMs / 260);
  ctx.fillStyle = "#1D4ED8";
  ctx.beginPath();
  ctx.arc(endX, endY, 13 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(endX, endY, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function LiveVehicleDetection({ onClose, navContext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectMsRef = useRef(0);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const speedTrackerRef = useRef(createSpeedTracker());
  // Keyed by the speed tracker's per-vehicle track id: classify each tracked vehicle once
  // and cache the result (a car doesn't change type mid-track), instead of re-running the
  // classifier on every single frame.
  const classificationsRef = useRef(new Map<number, ClassificationResult>());
  const classifyingRef = useRef(new Set<number>());
  // Same one-attempt-per-track caching as the classifier above, but for OCR'd plate text --
  // real text recognition is far too slow to run every frame (100ms-1s+ per attempt), so
  // each tracked vehicle only ever gets one read attempt, cached (or cached as "unreadable"
  // via null) for the rest of its time in frame.
  const plateTextRef = useRef(new Map<number, string | null>());
  const platesReadingRef = useRef(new Set<number>());
  // Read inside the detect loop's closure without re-subscribing the effect on every nav tick.
  const navContextRef = useRef(navContext);
  navContextRef.current = navContext;

  const [status, setStatus] = useState<"loading-model" | "requesting-camera" | "running" | "error">(
    "loading-model"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Back camera by default (better for spotting vehicles out the windshield); front camera
  // is the fallback on laptops/desktops that don't have a rear-facing one at all.
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  // The long how-this-works explainer only needs to be read once -- remembered permanently
  // (like the night-mode prompt in App.tsx) instead of blocking the camera view with the same
  // paragraph every single time AI Detection is opened.
  const [infoDismissed, setInfoDismissed] = useState(
    () => localStorage.getItem("trackline.aiDetectionInfoDismissed") === "1"
  );
  const dismissInfo = () => {
    setInfoDismissed(true);
    localStorage.setItem("trackline.aiDetectionInfoDismissed", "1");
  };

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        const cameraCount = devices.filter((d) => d.kind === "videoinput").length;
        setCanSwitchCamera(cameraCount > 1);
      })
      .catch(() => setCanSwitchCamera(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        if (!modelRef.current) {
          await tf.ready();
          modelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
          if (cancelled) return;
          warmUpClassifier();
          warmUpPlateOcr();
        }

        setStatus("requesting-camera");
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        setStatus("running");
        detectLoop();
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Camera or model failed to start.");
        setStatus("error");
      }
    }

    function detectLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const model = modelRef.current;
      if (!video || !canvas || !model || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }

      const nowMs = performance.now();
      if (nowMs - lastDetectMsRef.current < MIN_DETECT_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      lastDetectMsRef.current = nowMs;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      model.detect(video).then((predictions) => {
        const vehicleDetections = predictions
          .filter((p) => VEHICLE_CLASSES.has(p.class))
          .map((p) => ({ bbox: p.bbox as [number, number, number, number], score: p.score }));
        const tracked = speedTrackerRef.current.update(vehicleDetections, canvas.width, performance.now());
        const liveTrackIds = new Set(tracked.map((b) => b.id));
        pruneLightbarTracks(liveTrackIds);
        for (const id of plateTextRef.current.keys()) {
          if (!liveTrackIds.has(id)) plateTextRef.current.delete(id);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const nav = navContextRef.current;
        if (nav && !nav.hideTrace && nav.bearingToManeuverDeg !== null) {
          const relativeAngle = normalizeAngleDeg(nav.bearingToManeuverDeg - nav.travelHeadingDeg);
          drawGuideRibbon(ctx, canvas.width, canvas.height, relativeAngle, performance.now());
        }

        for (const box of tracked) {
          const [x, y, w, h] = box.bbox;

          if (!classificationsRef.current.has(box.id) && !classifyingRef.current.has(box.id)) {
            classifyingRef.current.add(box.id);
            classifyVehicleCrop(video, box.bbox)
              .then((result) => {
                if (result) classificationsRef.current.set(box.id, result);
              })
              .finally(() => classifyingRef.current.delete(box.id));
          }

          const classification = classificationsRef.current.get(box.id);
          const isEmergencyVehicle = classification && classification.label !== "other";
          // Runs independently of the trained classifier above -- it's a real-time pixel
          // heuristic for an actively strobing red/blue light (see lightbarDetector.ts),
          // not a "this car is unmarked police" model. Only flagged when the vehicle isn't
          // already confidently classified as a marked emergency vehicle, so a normal
          // marked police car with its lights on just keeps its usual red "Police car" box.
          const lightsActive = sampleLightbarActivity(video, box.id, box.bbox, performance.now());
          const isUnmarkedCandidate = !isEmergencyVehicle && lightsActive;
          const boxColor = isEmergencyVehicle ? "#DC2626" : isUnmarkedCandidate ? "#7C3AED" : "#F59E0B";

          ctx.strokeStyle = boxColor;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);

          const speedText =
            box.speedKmh === null
              ? ""
              : box.speedKmh > 3
                ? ` · ~${Math.round(box.speedKmh)} km/h approaching`
                : box.speedKmh < -3
                  ? ` · ~${Math.round(Math.abs(box.speedKmh))} km/h receding`
                  : " · steady";
          const label = isEmergencyVehicle
            ? `${CLASS_DISPLAY_NAMES[classification.label]} ${Math.round(classification.confidence * 100)}%${speedText}`
            : isUnmarkedCandidate
              ? `Unmarked police? (lights active)${speedText}`
              : `Vehicle ${Math.round(box.score * 100)}%${speedText}`;
          ctx.font = "16px system-ui, sans-serif";
          const textWidth = ctx.measureText(label).width;
          ctx.fillStyle = boxColor;
          ctx.fillRect(x, Math.max(0, y - 22), textWidth + 10, 22);
          // The violet "unmarked" box is darker than the amber/red ones, so it needs light
          // text instead of the usual dark text to stay readable.
          ctx.fillStyle = isUnmarkedCandidate ? "#ffffff" : "#111827";
          ctx.fillText(label, x + 5, Math.max(16, y - 6));

          // Real, live-computed plate-region estimate (see plateLocator.ts) -- NOT plate
          // reading/OCR, just a small box around where the plate likely is. Recomputed fresh
          // every frame from the current tracked box, so it only ever appears for a vehicle
          // that's actually in frame right now and naturally disappears the instant that
          // vehicle leaves (or the heuristic loses confidence), same as the vehicle box itself.
          const plate = locatePlate(video, box.bbox);
          if (plate) {
            ctx.strokeStyle = "#22D3EE";
            ctx.lineWidth = 2;
            ctx.strokeRect(plate.x, plate.y, plate.w, plate.h);

            // One real OCR attempt per tracked vehicle, cached (see plateOcr.ts for why this
            // can't run every frame) -- undefined means "not attempted yet", null means
            // "attempted, no confident read", a string means a successful read.
            if (plateTextRef.current.get(box.id) === undefined && !platesReadingRef.current.has(box.id)) {
              platesReadingRef.current.add(box.id);
              const cropCanvas = document.createElement("canvas");
              // Upscale the (tiny) plate crop before OCR -- Tesseract reads small text far
              // more reliably when it isn't asked to work from a handful of source pixels.
              const scale = Math.max(1, 120 / plate.w);
              cropCanvas.width = Math.round(plate.w * scale);
              cropCanvas.height = Math.round(plate.h * scale);
              const cropCtx = cropCanvas.getContext("2d");
              if (cropCtx) {
                cropCtx.drawImage(video, plate.x, plate.y, plate.w, plate.h, 0, 0, cropCanvas.width, cropCanvas.height);
                readPlateText(cropCanvas)
                  .then((text) => plateTextRef.current.set(box.id, text))
                  .finally(() => platesReadingRef.current.delete(box.id));
              } else {
                platesReadingRef.current.delete(box.id);
              }
            }

            const plateText = plateTextRef.current.get(box.id);
            if (plateText) {
              ctx.font = "bold 13px monospace";
              const plateTextWidth = ctx.measureText(plateText).width;
              ctx.fillStyle = "#22D3EE";
              ctx.fillRect(plate.x, Math.max(0, plate.y - 18), plateTextWidth + 8, 18);
              ctx.fillStyle = "#111827";
              ctx.fillText(plateText, plate.x + 4, Math.max(13, plate.y - 5));
            }
          }
        }
        rafRef.current = requestAnimationFrame(detectLoop);
      });
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [facingMode]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  return (
    <div className="detection-overlay">
      <div className="detection-video-wrap">
        <video ref={videoRef} className="detection-video" playsInline muted />
        <canvas ref={canvasRef} className="detection-canvas" />
      </div>

      <div className="detection-banner">
        {status === "loading-model" && "Loading detection model…"}
        {status === "requesting-camera" && "Requesting camera access…"}
        {status === "running" && navContext && (
          <>
            <strong>
              {navContext.distanceToManeuverM !== null
                ? `In ${formatDistance(navContext.distanceToManeuverM)}, `
                : ""}
              {navContext.instructionText}
            </strong>
            {navContext.hideTrace && " — route guide line hidden"}
          </>
        )}
        {status === "running" && !navContext && !infoDismissed && (
          <>
            {`Detecting vehicles (${facingMode === "environment" ? "back" : "front"} camera) — a custom-trained model guesses ambulance/fire truck/police car (red box, shown with its confidence %) when confident enough, generic "Vehicle" (amber box) otherwise. A separate light-flash detector flags any vehicle with an actively strobing red/blue light as "Unmarked police?" (violet box) even if it doesn't look like a marked car — it only catches lights that are actually on, not antennas or other hardware. It's trained on a modest ~500-image dataset and held to a stricter confidence bar for "Police car" specifically than the other labels, since that's the one result worth being extra conservative about — still a real but imperfect guess, never a certified identification or a guarantee. Speed is a rough estimate (assumes average car width, no calibration) — not radar-accurate. A small cyan box also estimates where each vehicle's number plate is, and attempts a real on-device text read of it (shown above the box when successful) — for detection display only, one attempt per vehicle, never stored or sent anywhere. It's a genuine but general-purpose OCR engine, not one built for plates specifically, so treat any reading as a rough attempt, not a confirmed plate number — especially from a moving vehicle at an angle.`}
            <button className="detection-banner-dismiss" onClick={dismissInfo}>
              Got it, don't show this again
            </button>
          </>
        )}
        {status === "error" && (errorMessage ?? "Something went wrong starting the camera.")}
      </div>

      {navContext && status === "running" ? (
        <div className="detection-bottom-panel">
          <div className="detection-nav-stats-row">
            <div>
              <div className="detection-nav-stat-value">{navContext.arrivalClockText}</div>
              <div className="detection-nav-stat-label">arrival</div>
            </div>
            <div>
              <div className="detection-nav-stat-value">{navContext.etaText}</div>
              <div className="detection-nav-stat-label">ETA</div>
            </div>
            <div>
              <div className="detection-nav-stat-value">{navContext.distanceRemainingText}</div>
              <div className="detection-nav-stat-label">remaining</div>
            </div>
          </div>
          <NavActionsRow
            hasStop={navContext.hasStop}
            onAddStop={navContext.onAddStop}
            onShareEta={navContext.onShareEta}
            onReportAlert={navContext.onReportAlert}
          />
          <div className="detection-bottom-panel-buttons">
            {canSwitchCamera && (
              <button onClick={switchCamera} aria-label="Switch camera">
                🔄 Switch
              </button>
            )}
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <>
          {canSwitchCamera && (
            <button className="detection-switch" onClick={switchCamera} aria-label="Switch camera">
              🔄 Switch camera
            </button>
          )}
          <button className="detection-close" onClick={onClose}>
            Close
          </button>
        </>
      )}
    </div>
  );
}
