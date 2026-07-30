import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as jpeg from "jpeg-js";
import { File } from "expo-file-system";
import { ensureTfReady } from "@/services/tfPlatform";
import { cachedModelIO } from "@/services/cachedModelIO";
import { Sentry } from "@/services/sentry";

// COCO-SSD fetches its own base model (several MB, model.json + weight shards) from
// Google's CDN on every single load by default -- there's no persistent cache without this,
// since tfPlatform.ts's minimal shim doesn't register one the way a browser's IndexedDB-
// backed handler would. cachedModelIO (below) intercepts that fetch and routes it through an
// on-device disk cache instead, so only the very first vehicle-detection session ever touches
// the network for this.
//
// This used to be wired up via tf.io.registerLoadRouter(), which registers a *global* router
// that competes with tfjs-core's own built-in generic HTTP router (also always registered,
// also matches any https:// URL). With two routers both claiming the same model URL, tfjs's
// router registry throws "Found more than one (2) load handlers for URL ..." -- confirmed
// exactly this error from a real device. Fixed by not registering a competing router at all:
// loadGraphModel (which coco-ssd calls internally) accepts either a URL string or an IOHandler
// directly, so the cached handler is passed straight in as `modelUrl` below instead.
const COCO_SSD_BASE = "lite_mobilenet_v2" as const;
// Matches coco-ssd's own BASE_PATH + getPrefix(base) + "/model.json" for this base model --
// see @tensorflow-models/coco-ssd's index.js. Not configurable, so safe to hardcode here.
const COCO_SSD_MODEL_URL =
  "https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json";

// COCO-SSD (the pretrained model this runs) only knows generic COCO classes — "car" /
// "truck" / "bus" / "motorcycle" -- not "police car" or "ambulance". This app used to run a
// second, custom-trained classifier (src/services/vehicleClassifier.ts, still present but no
// longer called from here) behind each box to guess ambulance/firetruck/police-car. Dropped
// for the same reason the web app already dropped its identical model: repeated real-world
// testing kept producing confidently-wrong "Police car" results on ordinary cars even after
// tightening its confidence bar twice -- a ~500-image training set just isn't enough to be
// honest about on a live phone camera. Generic labels plus the real, evidence-based lightbar
// flash detector (lightbarDetector.ts) below replace it, matching
// web/src/components/LiveVehicleDetection.tsx's own fix.
const VEHICLE_CLASSES = new Set(["car", "truck", "bus", "motorcycle"]);
const HEAVY_VEHICLE_CLASSES = new Set(["truck", "bus"]);

export interface VehicleBox {
  label: "Vehicle" | "Heavy Vehicle";
  score: number;
  // [x, y, width, height] in pixels, relative to the source image dimensions.
  bbox: [number, number, number, number];
}

export interface DecodedPhoto {
  width: number;
  height: number;
  // RGB, 3 bytes per pixel -- shared between COCO-SSD detection and the lightbar flash
  // sampler below so a single capture only ever gets JPEG-decoded once.
  data: Uint8Array;
}

// coco-ssd's own load() isn't just a download -- it also runs a real warmup inference (a
// tf.zeros([1,300,300,3]) tensor through the *entire* SSD-MobileNet graph, awaiting every
// output tensor's .data()) before resolving. On this app's CPU-only tfjs backend (no WebGL/GPU
// acceleration -- that needs expo-gl + real device verification, a bigger, riskier change than
// this) that warmup pass is a genuinely heavy synchronous-ish computation, and was almost all
// of "takes long to load" -- the actual network fetch (especially once disk-cached) is fast.
// Below skips that warmup entirely and only does the fetch/parse, matching the "load
// immediately" ask directly: the model graph exists but nothing has run through it yet, so the
// very first real detection pass (in detectVehiclesInPhoto) absorbs that one-time compute
// instead of a dedicated loading screen doing it up front. That trade -- a slightly slower
// first detected frame vs. a screen that's immediately live and interactive (Close/Switch
// camera responsive right away, not fighting a blocked JS thread) -- is a straightforward win
// for how this feature is actually used.
function loadModelSkippingWarmup(): Promise<cocoSsd.ObjectDetection> {
  Sentry.logger.info("vehicleDetection: loadModelSkippingWarmup start");
  const objectDetection = new cocoSsd.ObjectDetection(COCO_SSD_BASE);
  return tf.loadGraphModel(cachedModelIO(COCO_SSD_MODEL_URL, "ssdlite_mobilenet_v2")).then((model) => {
    // ObjectDetection.model is only "private" in its .d.ts -- a real, plain instance property
    // at runtime, which is exactly what coco-ssd's own load() sets it to internally. Only
    // reaching around the type here to skip the warmup call load() would otherwise also do.
    (objectDetection as unknown as { model: tf.GraphModel }).model = model;
    Sentry.logger.info("vehicleDetection: loadModelSkippingWarmup done, graph model assigned");
    return objectDetection;
  });
}

const MODEL_LOAD_TIMEOUT_MS = 25000;

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

function loadModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    Sentry.logger.info("vehicleDetection: loadModel -- ensureTfReady start");
    modelPromise = ensureTfReady()
      .then(() => {
        Sentry.logger.info("vehicleDetection: ensureTfReady done");
        return loadModelSkippingWarmup();
      })
      .catch((err) => {
        // Don't leave a permanently-rejected promise cached -- without this, one failed
        // load (a network blip, a cold CDN fetch that timed out) would keep failing
        // instantly forever, even after connectivity recovers, until the app fully restarts.
        Sentry.logger.error("vehicleDetection: loadModel failed", { error: String(err) });
        modelPromise = null;
        throw err;
      });
  }
  return modelPromise;
}

export async function warmUpModel(): Promise<void> {
  Sentry.logger.info("vehicleDetection: warmUpModel called");
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      Sentry.logger.error("vehicleDetection: warmUpModel timed out", { timeoutMs: MODEL_LOAD_TIMEOUT_MS });
      reject(
        new Error(
          "Detection model is taking unusually long to load -- check your connection, or try again."
        )
      );
    }, MODEL_LOAD_TIMEOUT_MS);
  });
  try {
    await Promise.race([loadModel(), timeout]);
    Sentry.logger.info("vehicleDetection: warmUpModel resolved");
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/** Decodes a captured JPEG photo into raw RGB pixels, without the unmaintained
 *  @tensorflow/tfjs-react-native's decodeJpeg -- jpeg-js is a plain, actively-maintained
 *  pure-JS decoder with no native/platform dependency of its own. */
export async function decodePhotoForDetection(uri: string): Promise<DecodedPhoto> {
  const buffer = await new File(uri).arrayBuffer();
  const { width, height, data } = jpeg.decode(new Uint8Array(buffer), {
    useTArray: true,
    formatAsRGBA: false,
  });
  return { width, height, data };
}

/** Runs detection on an already-decoded photo (see decodePhotoForDetection) and returns
 *  generic vehicle-class boxes. */
export async function detectVehiclesInPhoto(photo: DecodedPhoto): Promise<VehicleBox[]> {
  const model = await loadModel();
  const imageTensor = tf.tensor3d(photo.data, [photo.height, photo.width, 3], "int32");

  try {
    const predictions = await model.detect(imageTensor);
    return predictions
      .filter((p) => VEHICLE_CLASSES.has(p.class))
      .map((p) => ({
        label: HEAVY_VEHICLE_CLASSES.has(p.class) ? ("Heavy Vehicle" as const) : ("Vehicle" as const),
        score: p.score,
        bbox: p.bbox as [number, number, number, number],
      }));
  } finally {
    imageTensor.dispose();
  }
}
