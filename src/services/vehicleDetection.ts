import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as jpeg from "jpeg-js";
import { File } from "expo-file-system";
import { ensureTfReady } from "@/services/tfPlatform";
import { cachedModelIO } from "@/services/cachedModelIO";

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

const MODEL_LOAD_TIMEOUT_MS = 25000;

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

function loadModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = ensureTfReady()
      .then(() =>
        cocoSsd.load({
          base: COCO_SSD_BASE,
          // coco-ssd's own type only declares `modelUrl?: string`, but at runtime it's
          // handed straight to tfjs-converter's loadGraphModel(), which explicitly accepts
          // "a url or an IOHandler that loads the model" -- the cast reflects that real,
          // documented runtime behavior, not a type-checker workaround for a bug.
          modelUrl: cachedModelIO(COCO_SSD_MODEL_URL, "ssdlite_mobilenet_v2") as unknown as string,
        })
      )
      .catch((err) => {
        // Don't leave a permanently-rejected promise cached -- without this, one failed
        // load (a network blip, a cold CDN fetch that timed out) would keep failing
        // instantly forever, even after connectivity recovers, until the app fully restarts.
        modelPromise = null;
        throw err;
      });
  }
  return modelPromise;
}

export async function warmUpModel(): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error("Detection model took too long to load -- check your connection.")),
      MODEL_LOAD_TIMEOUT_MS
    );
  });
  try {
    await Promise.race([loadModel(), timeout]);
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
