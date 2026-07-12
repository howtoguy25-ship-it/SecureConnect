import * as tf from "@tensorflow/tfjs";
import { ensureTfReady } from "@/services/tfPlatform";
import { bundledModelIO } from "@/services/modelAssetIO";

// Trained on a modest ~500-image labeled dataset (see training/README.md) -- a real but
// imperfect best guess, not a certified identification. Same model file and thresholds as
// the web app's classifier (web/src/services/vehicleClassifier.ts).
const CLASS_NAMES = ["ambulance", "firetruck", "other", "police-car"] as const;
const CONFIDENCE_THRESHOLD = 0.6;
const INPUT_SIZE = 224;
const MIN_CROP_PX = 20;

export type VehicleClass = (typeof CLASS_NAMES)[number];

export interface ClassificationResult {
  label: VehicleClass;
  confidence: number;
}

// require()'d so Metro bundles these as local assets (see metro.config.js for the .bin
// asset-extension registration this and bundledModelIO need).
const modelJson = require("../../assets/models/vehicle-classifier/model.json");
const modelWeights = [
  require("../../assets/models/vehicle-classifier/group1-shard1of3.bin"),
  require("../../assets/models/vehicle-classifier/group1-shard2of3.bin"),
  require("../../assets/models/vehicle-classifier/group1-shard3of3.bin"),
];

let modelPromise: Promise<tf.LayersModel> | null = null;

function loadModel(): Promise<tf.LayersModel> {
  if (!modelPromise) {
    modelPromise = ensureTfReady().then(() =>
      tf.loadLayersModel(bundledModelIO(modelJson, modelWeights))
    );
  }
  return modelPromise;
}

export async function warmUpClassifier(): Promise<void> {
  try {
    await loadModel();
  } catch (err) {
    console.warn("[vehicle-classifier] failed to load, will keep using generic labels", err);
  }
}

/**
 * Classifies a cropped region of an already-decoded photo tensor. Does not dispose
 * `imageTensor` -- the caller owns it and is responsible for cleanup.
 */
export async function classifyVehicleCrop(
  imageTensor: tf.Tensor3D,
  bbox: [number, number, number, number]
): Promise<ClassificationResult | null> {
  let model: tf.LayersModel;
  try {
    model = await loadModel();
  } catch {
    return null;
  }

  const [x, y, w, h] = bbox;
  if (w < MIN_CROP_PX || h < MIN_CROP_PX) return null;

  // tf.tidy's TypeScript types don't allow returning null (a `TensorContainer` can't be
  // null even though this always resolves to a plain object at runtime), so an invalid-crop
  // sentinel is returned instead and translated to null just outside the tidy scope.
  const outcome = tf.tidy((): { label: VehicleClass; confidence: number } => {
    const [imgH, imgW] = imageTensor.shape;
    const top = Math.max(0, Math.round(y));
    const left = Math.max(0, Math.round(x));
    const cropH = Math.min(Math.round(h), imgH - top);
    const cropW = Math.min(Math.round(w), imgW - left);
    if (cropH <= 0 || cropW <= 0) return { label: "other", confidence: 0 };

    const cropped = tf.slice(imageTensor, [top, left, 0], [cropH, cropW, 3]);
    const resized = tf.image.resizeBilinear(cropped, [INPUT_SIZE, INPUT_SIZE]);
    // Matches training's Rescaling(1/127.5, offset=-1) so inputs land in [-1, 1] like MobileNetV2 expects.
    const normalized = resized.toFloat().div(127.5).sub(1).expandDims(0);

    const output = model.predict(normalized) as tf.Tensor;
    const probs = output.dataSync();
    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[bestIdx]) bestIdx = i;
    }
    return { label: CLASS_NAMES[bestIdx], confidence: probs[bestIdx] };
  });

  if (outcome.confidence < CONFIDENCE_THRESHOLD) return null;
  return outcome;
}
