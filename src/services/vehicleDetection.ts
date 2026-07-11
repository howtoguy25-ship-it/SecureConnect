import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-react-native";
import { decodeJpeg } from "@tensorflow/tfjs-react-native";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as FileSystem from "expo-file-system";

// Same model/labels as the web app's live detection — see web/src/components/LiveVehicleDetection.tsx
// for why boxes are labeled generically "Vehicle" rather than police/ambulance/etc.
const VEHICLE_CLASSES = new Set(["car", "truck", "bus", "motorcycle"]);

export interface VehicleBox {
  label: string;
  score: number;
  // [x, y, width, height] in pixels, relative to the source image dimensions.
  bbox: [number, number, number, number];
}

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

function loadModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = tf.ready().then(() => cocoSsd.load({ base: "lite_mobilenet_v2" }));
  }
  return modelPromise;
}

export async function warmUpModel(): Promise<void> {
  await loadModel();
}

/** Runs detection on a photo captured via expo-camera and returns vehicle-class boxes. */
export async function detectVehiclesInPhoto(uri: string): Promise<VehicleBox[]> {
  const model = await loadModel();

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const raw = tf.util.encodeString(base64, "base64").buffer;
  const imageTensor = decodeJpeg(new Uint8Array(raw));

  try {
    const predictions = await model.detect(imageTensor);
    return predictions
      .filter((p) => VEHICLE_CLASSES.has(p.class))
      .map((p) => ({ label: "Vehicle", score: p.score, bbox: p.bbox as [number, number, number, number] }));
  } finally {
    imageTensor.dispose();
  }
}
