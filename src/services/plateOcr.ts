import { ImageManipulator } from "expo-image-manipulator";
import { recognizeText } from "rn-mlkit-ocr";
import type { PlateRegion } from "@/utils/plateLocator";

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
  const cropped = await ImageManipulator.manipulate(photoUri)
    .crop({
      originX: Math.max(0, Math.round(region.x)),
      originY: Math.max(0, Math.round(region.y)),
      width: Math.max(1, Math.round(region.w)),
      height: Math.max(1, Math.round(region.h)),
    })
    .renderAsync();
  const saved = await cropped.saveAsync();

  const result = await recognizeText(saved.uri);
  for (const block of result.blocks) {
    const candidate = bestPlateCandidate(block.text);
    if (candidate) return candidate;
  }
  return null;
}
