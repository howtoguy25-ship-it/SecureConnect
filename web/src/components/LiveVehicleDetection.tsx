import { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import "./LiveVehicleDetection.css";

// COCO-SSD (the pretrained model this runs) only knows generic COCO classes — it has no
// concept of "police car" or "ambulance", just "car" / "truck" / "bus" / "motorcycle".
// Labeling boxes as anything more specific than "Vehicle" would be a false claim of
// capability the model doesn't have.
const VEHICLE_CLASSES = new Set(["car", "truck", "bus", "motorcycle"]);

interface Props {
  onClose: () => void;
}

export function LiveVehicleDetection({ onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  const [status, setStatus] = useState<"loading-model" | "requesting-camera" | "running" | "error">(
    "loading-model"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        await tf.ready();
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        if (cancelled) return;
        modelRef.current = model;

        setStatus("requesting-camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const pred of predictions) {
          if (!VEHICLE_CLASSES.has(pred.class)) continue;
          const [x, y, w, h] = pred.bbox;
          ctx.strokeStyle = "#F59E0B";
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);

          const label = `Vehicle ${Math.round(pred.score * 100)}%`;
          ctx.font = "16px system-ui, sans-serif";
          const textWidth = ctx.measureText(label).width;
          ctx.fillStyle = "#F59E0B";
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
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
        {status === "running" && "Detecting vehicles — boxes show any car/truck/bus/motorcycle in view, not specifically police or ambulance."}
        {status === "error" && (errorMessage ?? "Something went wrong starting the camera.")}
      </div>

      <button className="detection-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
