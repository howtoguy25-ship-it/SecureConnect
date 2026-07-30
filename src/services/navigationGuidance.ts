import { distanceKm } from "@/utils/geo";
import type { RouteStep } from "@/services/directions";

const MANEUVER_TRIGGER_METERS = 200;
// Widened from a fixed 25m -- this app polls GPS every ~2s or every 5m travelled (see
// LocationContext's watchPositionAsync), and at highway speed a couple of fixes that close
// together can still land 30-40m apart. A 25m-only capture window was a real, confirmed way
// for a completed instruction to get stuck on screen instead of clearing: a fast-moving vehicle
// could jump clean over it between two consecutive fixes.
const STEP_COMPLETE_METERS = 35;
// How many steps ahead to check for "already passed this one too, in the same GPS tick" --
// covers several short, closely-spaced maneuvers (e.g. consecutive roundabout exits, as seen in
// this app's own directions list) all being covered between two fixes. Bounded so this stays a
// cheap, constant-time check every tick instead of scanning the whole remaining route.
const SKIP_AHEAD_LIMIT = 4;

export interface GuidanceState {
  activeStepIndex: number;
  spokenStepIndices: Set<number>;
}

export function createGuidanceState(): GuidanceState {
  return { activeStepIndex: 0, spokenStepIndices: new Set() };
}

function distanceToStepEndMeters(step: RouteStep, userLat: number, userLng: number): number {
  return distanceKm(userLat, userLng, step.endLocation.latitude, step.endLocation.longitude) * 1000;
}

/**
 * Advances guidance against the user's live position. Returns the step to speak (if any)
 * this tick, and whether the active step index changed (route progressed to next maneuver).
 */
export function evaluateGuidance(
  state: GuidanceState,
  steps: RouteStep[],
  userLat: number,
  userLng: number
): { stepToSpeak: RouteStep | null; activeStepIndex: number } {
  if (state.activeStepIndex >= steps.length) {
    return { stepToSpeak: null, activeStepIndex: state.activeStepIndex };
  }

  const currentStep = steps[state.activeStepIndex];
  const distMeters = distanceToStepEndMeters(currentStep, userLat, userLng);

  let stepToSpeak: RouteStep | null = null;

  if (!state.spokenStepIndices.has(state.activeStepIndex) && distMeters <= MANEUVER_TRIGGER_METERS) {
    stepToSpeak = currentStep;
    state.spokenStepIndices.add(state.activeStepIndex);
  }

  // Consider the maneuver complete once the user is very close to (or has passed) the
  // step's end point, then advance to the next step.
  if (distMeters <= STEP_COMPLETE_METERS) {
    if (state.activeStepIndex < steps.length - 1) state.activeStepIndex += 1;
  } else {
    // GPS-jump case: this fix isn't close to the *current* step's end, but check whether it
    // already landed past one or more of the next few steps too -- see SKIP_AHEAD_LIMIT above.
    for (let ahead = 1; ahead <= SKIP_AHEAD_LIMIT && state.activeStepIndex + ahead < steps.length; ahead++) {
      const aheadIndex = state.activeStepIndex + ahead;
      if (distanceToStepEndMeters(steps[aheadIndex], userLat, userLng) <= STEP_COMPLETE_METERS) {
        // Every step from the old activeStepIndex through aheadIndex is now behind the
        // vehicle -- nothing left to announce for a maneuver already passed, so mark them
        // spoken and jump straight past all of them.
        for (let i = state.activeStepIndex; i <= aheadIndex; i++) state.spokenStepIndices.add(i);
        state.activeStepIndex = Math.min(aheadIndex + 1, steps.length - 1);
        break;
      }
    }
  }

  return { stepToSpeak, activeStepIndex: state.activeStepIndex };
}
