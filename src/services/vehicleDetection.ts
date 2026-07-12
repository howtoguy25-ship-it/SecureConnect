import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as jpeg from "jpeg-js";
import { File } from "expo-file-system";
import { ensureTfReady } from "@/services/tfPlatform";
import { classifyVehicleCrop, warmUpClassifier, type VehicleClass } from "@/services/vehicleClassifier";

// COCO-SSD (the pretrained model this runs) only knows generic COCO classes — it has no
// concept of "police car" or "ambulance", just "car" / "truck" / "bus" / "motorcycle". A
// second, custom-trained classifier (see training/README.md) runs behind it on each box to
// take a real guess at ambulance/firetruck/police-car -- trained on a modest ~500-image
// dataset, so it's a confidence score, not a certified ID, and falls back to the generic
// "Vehicle" label whenever it isn't confident enough. Same approach as the web app's live
// detection — see web/src/components/LiveVehicleDetection.tsx.
const VEHICLE_CLASSES = new Set(["car", "truck", "bus", "motorcycle"]);

const CLASS_DISPLAY_NAMES: Record<VehicleClass, string> = {
  ambulance: "Ambulance",
  firetruck: "Fire truck",
  "police-car": "Police car",
  other: "Vehicle",
};

export interface VehicleBox {
  label: string;
  score: number;
  // Set only when the custom classifier identified this as ambulance/firetruck/police-car;
  // absent (and label is the generic "Vehicle") when it wasn't confident enough.
  confidence?: number;
  // [x, y, width, height] in pixels, relative to the source image dimensions.
  bbox: [number, number, number, number];
}

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

function loadModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = ensureTfReady().then(() => cocoSsd.load({ base: "lite_mobilenet_v2" }));
  }
  return modelPromise;
}

export async function warmUpModel(): Promise<void> {
  await loadModel();
  await warmUpClassifier();
}

/** Decodes a captured JPEG photo into a pixel tensor, without the unmaintained
 *  @tensorflow/tfjs-react-native's decodeJpeg -- jpeg-js is a plain, actively-maintained
 *  pure-JS decoder with no native/platform dependency of its own. */
async function decodePhotoToTensor(uri: string): Promise<tf.Tensor3D> {
  const buffer = await new File(uri).arrayBuffer();
  const { width, height, data } = jpeg.decode(new Uint8Array(buffer), {
    useTArray: true,
    formatAsRGBA: false,
  });
  return tf.tensor3d(data, [height, width, 3], "int32");
}

/** Runs detection on a photo captured via expo-camera and returns vehicle-class boxes. */
export async function detectVehiclesInPhoto(uri: string): Promise<VehicleBox[]> {
  const model = await loadModel();
  const imageTensor = await decodePhotoToTensor(uri);

  try {
    const predictions = await model.detect(imageTensor);
    const vehiclePredictions = predictions.filter((p) => VEHICLE_CLASSES.has(p.class));

    const boxes: VehicleBox[] = [];
    for (const p of vehiclePredictions) {
      const bbox = p.bbox as [number, number, number, number];
      const classification = await classifyVehicleCrop(imageTensor, bbox);
      if (classification && classification.label !== "other") {
        boxes.push({
          label: CLASS_DISPLAY_NAMES[classification.label],
          score: p.score,
          confidence: classification.confidence,
          bbox,
        });
      } else {
        boxes.push({ label: "Vehicle", score: p.score, bbox });
      }
    }
    return boxes;
  } finally {
    imageTensor.dispose();
  }
}
