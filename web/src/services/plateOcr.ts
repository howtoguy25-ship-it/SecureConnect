import { createWorker, type Worker } from "tesseract.js";

// Real on-device text recognition for the plate region plateLocator.ts finds -- built on
// Tesseract.js, an established open-source OCR engine (not something trained from scratch
// here: there's no labeled dataset of plate photos-to-plate-text available to train a
// purpose-built recognizer on, the same constraint noted for the vehicle classifier's
// ~500-image dataset, just worse -- character-level OCR training needs orders of magnitude
// more labeled examples than that). Tesseract is a real, working recognizer, just a
// general-purpose one, not tuned specifically for plates -- so treat any result as a rough
// read, not a certified one, especially from a moving phone camera at an angle. Runs entirely
// on-device (WebAssembly, in a worker) -- the cropped plate image and the recognized text
// never leave the browser, matching the rest of this app's on-device-only detection.
let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, { logger: () => {} }).then(async (worker) => {
      // Plates are short, all-caps alphanumeric strings -- constraining recognition to that
      // alphabet measurably improves accuracy over unconstrained free-text recognition.
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      });
      return worker;
    });
  }
  return workerPromise;
}

/** Downloads/initializes the OCR engine ahead of the first real read, so the first plate
 *  crop doesn't stall on a multi-second cold start. Safe to call more than once. */
export function warmUpPlateOcr(): void {
  getWorker().catch((err) => console.warn("[plateOcr] warm-up failed", err));
}

const MIN_PLATE_TEXT_LEN = 4;
const MAX_PLATE_TEXT_LEN = 8;
const MIN_CONFIDENCE = 45;

/** Attempts to read the plate text from a small cropped canvas of just the plate region.
 *  Returns the recognized string, or null if the OCR engine couldn't produce a
 *  plausible, confident plate-length read. */
export async function readPlateText(crop: HTMLCanvasElement): Promise<string | null> {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(crop);
    const cleaned = data.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleaned.length < MIN_PLATE_TEXT_LEN || cleaned.length > MAX_PLATE_TEXT_LEN) return null;
    if (data.confidence < MIN_CONFIDENCE) return null;
    return cleaned;
  } catch (err) {
    console.warn("[plateOcr] recognize failed", err);
    return null;
  }
}
