import { loadTensorflowModel, type TensorflowModel } from "react-native-fast-tflite";
import { NitroModules, type BoxedHybridObject } from "react-native-nitro-modules";
import { Sentry } from "@/services/sentry";

// Classic TFLite_Detection_PostProcess SSD MobileNet v1 (COCO, quantized) -- bundled directly
// (see metro.config.js's .tflite asset registration) so the very first open has zero network
// dependency, same reasoning as the old tfjs model bundling this replaces. Its 4-tensor output
// format (boxes/classes/scores/count) and the 0-indexed COCO class ids it was trained on are
// documented next to where they're parsed, inside the Frame Processor in
// VehicleDetectionScreen.tsx -- see assets/models/tflite_ssd_mobilenet_v1/labelmap.txt for the
// model's full class list.
const MODEL_ASSET = require("../../assets/models/tflite_ssd_mobilenet_v1/model.tflite");

export const TFLITE_INPUT_SIZE = 300;

let boxedModelPromise: Promise<BoxedHybridObject<TensorflowModel>> | null = null;

// Boxed once here (not inside the Frame Processor) so every call after the first just returns
// the same cached, already-boxed model. NitroModules.box() specifically exists so a Nitro
// HybridObject created on the JS thread (loadTensorflowModel resolves here) can still be safely
// referenced from inside a separate worklet Runtime -- this app's Frame Processor runs on
// react-native-worklets-core's own Runtime, which (per NitroModules' own documentation) doesn't
// yet support copying HybridObjects via its newer JSI NativeState APIs without this explicit
// box()/.unbox() step.
export function loadBoxedTFLiteModel(): Promise<BoxedHybridObject<TensorflowModel>> {
  if (!boxedModelPromise) {
    const tStart = Date.now();
    boxedModelPromise = loadTensorflowModel(MODEL_ASSET, [])
      .then((model) => {
        Sentry.logger.info("perf: tfliteVehicleModel.load", { ms: Date.now() - tStart });
        return NitroModules.box(model);
      })
      .catch((err) => {
        Sentry.logger.error("tfliteVehicleModel: load failed", { error: String(err) });
        boxedModelPromise = null;
        throw err;
      });
  }
  return boxedModelPromise;
}
