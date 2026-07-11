import * as tf from "@tensorflow/tfjs";

// Trained on a modest ~500-image labeled dataset (see training/README.md) -- a real but
// imperfect best guess, not a certified identification. Callers should fall back to the
// generic "Vehicle" label from COCO-SSD whenever this returns null (model not loaded yet,
// crop too small, or confidence below threshold).
const CLASS_NAMES = ["ambulance", "firetruck", "other", "police-car"] as const;
const MODEL_URL = `${import.meta.env.BASE_URL}models/vehicle-classifier/model.json`;
const CONFIDENCE_THRESHOLD = 0.6;
const INPUT_SIZE = 224;
const MIN_CROP_PX = 20;

export type VehicleClass = (typeof CLASS_NAMES)[number];

export interface ClassificationResult {
  label: VehicleClass;
  confidence: number;
}

let modelPromise: Promise<tf.LayersModel> | null = null;

function loadModel(): Promise<tf.LayersModel> {
  if (!modelPromise) {
    modelPromise = tf.ready().then(() => tf.loadLayersModel(MODEL_URL));
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

/** Classifies a cropped vehicle region as ambulance/firetruck/police-car/other. */
export async function classifyVehicleCrop(
  source: HTMLVideoElement | HTMLCanvasElement,
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
    const full = tf.browser.fromPixels(source);
    const [imgH, imgW] = full.shape;
    const top = Math.max(0, Math.round(y));
    const left = Math.max(0, Math.round(x));
    const cropH = Math.min(Math.round(h), imgH - top);
    const cropW = Math.min(Math.round(w), imgW - left);
    if (cropH <= 0 || cropW <= 0) return { label: "other", confidence: 0 };

    const cropped = tf.slice(full, [top, left, 0], [cropH, cropW, 3]);
    const resized = tf.image.resizeBilinear(cropped as tf.Tensor3D, [INPUT_SIZE, INPUT_SIZE]);
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
