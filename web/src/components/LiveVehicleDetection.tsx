import { useEffect, useRef, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { createSpeedTracker } from "@/utils/speedTracker";
import {
  warmUpClassifier,
  classifyVehicleCrop,
  type ClassificationResult,
  type VehicleClass,
} from "@/services/vehicleClassifier";
import "./LiveVehicleDetection.css";

// COCO-SSD (the pretrained model this runs) only knows generic COCO classes — it has no
// concept of "police car" or "ambulance", just "car" / "truck" / "bus" / "motorcycle". A
// second, custom-trained classifier (see training/README.md) runs behind it on each box to
// take a real guess at ambulance/firetruck/police-car -- trained on a modest ~500-image
// dataset, so it's shown as a confidence score, not a certified ID, and falls back to the
// generic "Vehicle" label whenever it isn't confident enough.
const VEHICLE_CLASSES = new Set(["car", "truck", "bus", "motorcycle"]);

const CLASS_DISPLAY_NAMES: Record<VehicleClass, string> = {
  ambulance: "Ambulance",
  firetruck: "Fire truck",
  "police-car": "Police car",
  other: "Vehicle",
};

type FacingMode = "environment" | "user";

interface Props {
  onClose: () => void;
}

export function LiveVehicleDetection({ onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const speedTrackerRef = useRef(createSpeedTracker());
  // Keyed by the speed tracker's per-vehicle track id: classify each tracked vehicle once
  // and cache the result (a car doesn't change type mid-track), instead of re-running the
  // classifier on every single frame.
  const classificationsRef = useRef(new Map<number, ClassificationResult>());
  const classifyingRef = useRef(new Set<number>());

  const [status, setStatus] = useState<"loading-model" | "requesting-camera" | "running" | "error">(
    "loading-model"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Back camera by default (better for spotting vehicles out the windshield); front camera
  // is the fallback on laptops/desktops that don't have a rear-facing one at all.
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);

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

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      model.detect(video).then((predictions) => {
        const vehicleDetections = predictions
          .filter((p) => VEHICLE_CLASSES.has(p.class))
          .map((p) => ({ bbox: p.bbox as [number, number, number, number], score: p.score }));
        const tracked = speedTrackerRef.current.update(vehicleDetections, canvas.width, performance.now());

        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
          const boxColor = isEmergencyVehicle ? "#DC2626" : "#F59E0B";

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
            : `Vehicle ${Math.round(box.score * 100)}%${speedText}`;
          ctx.font = "16px system-ui, sans-serif";
          const textWidth = ctx.measureText(label).width;
          ctx.fillStyle = boxColor;
          ctx.fillRect(x, Math.max(0, y - 22), textWidth + 10, 22);
          ctx.fillStyle = "#111827";
          ctx.fillText(label, x + 5, Math.max(16, y - 6));
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
        {status === "running" &&
          `Detecting vehicles (${facingMode === "environment" ? "back" : "front"} camera) — a custom-trained model guesses ambulance/fire truck/police car (red box, shown with its confidence %) when confident enough, generic "Vehicle" (amber box) otherwise. It's trained on a modest ~500-image dataset — a real but imperfect guess, not certified identification. Speed is a rough estimate (assumes average car width, no calibration) — not radar-accurate.`}
        {status === "error" && (errorMessage ?? "Something went wrong starting the camera.")}
      </div>

      {canSwitchCamera && (
        <button className="detection-switch" onClick={switchCamera} aria-label="Switch camera">
          🔄 Switch camera
        </button>
      )}

      <button className="detection-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
