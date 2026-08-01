import { ImageManipulator } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { recognizeText } from "rn-mlkit-ocr";
import type { PlateRegion } from "@/utils/plateLocator";
import { Sentry } from "@/services/sentry";

// Plausible plate text: letters/digits only, length in a real plate's range -- filters out
// OCR noise (stray punctuation, a single misread character) without trying to validate
// against any specific state/country format.
const PLATE_TEXT_PATTERN = /^[A-Z0-9]{3,8}$/;

function bestPlateCandidate(text: string): string | null {
  const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PLATE_TEXT_PATTERN.test(cleaned) ? cleaned : null;
}

/**
 * Crops the estimated plate region out of an already-captured photo and runs on-device OCR
 * (Google ML Kit, via rn-mlkit-ocr) on just that crop. Runs entirely on-device -- no network
 * call, nothing uploaded to any API, nothing stored beyond the temporary cropped file the OS
 * discards on its own. Returns null (never a low-confidence guess) if nothing plate-shaped
 * was actually read from the crop.
 */
export async function readPlateText(photoUri: string, region: PlateRegion): Promise<string | null> {
  const crop = {
    originX: Math.max(0, Math.round(region.x)),
    originY: Math.max(0, Math.round(region.y)),
    width: Math.max(1, Math.round(region.w)),
    height: Math.max(1, Math.round(region.h)),
  };
  Sentry.logger.info("plateOcr: calling ImageManipulator crop", crop);
  const cropped = await ImageManipulator.manipulate(photoUri).crop(crop).renderAsync();
  Sentry.logger.info("plateOcr: crop rendered, calling saveAsync");
  const saved = await cropped.saveAsync();

  try {
    Sentry.logger.info("plateOcr: calling rn-mlkit-ocr recognizeText");
    const result = await recognizeText(saved.uri);
    Sentry.logger.info("plateOcr: recognizeText resolved", { blockCount: result.blocks.length });
    for (const block of result.blocks) {
      const candidate = bestPlateCandidate(block.text);
      if (candidate) return candidate;
    }
    return null;
  } finally {
    // This crop is a brand-new temp file ImageManipulator wrote to disk on every single OCR
    // attempt (up to MAX_PLATE_ATTEMPTS times per vehicle, for every vehicle in frame, every
    // ~1s) -- never cleaning it up left hundreds of leaked JPEGs behind after a normal driving
    // session, a real, confirmed contributor to this screen eventually crashing under storage/
    // memory pressure on a long session. Best-effort: a failed cleanup here is silently
    // swallowed rather than surfaced as a plate-read failure.
    try {
      new File(saved.uri).delete();
    } catch {}
  }
}
