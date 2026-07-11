import { distanceKm } from "@/utils/geo";
import type { RouteStep } from "@/services/directions";

const MANEUVER_TRIGGER_METERS = 200;

export interface GuidanceState {
  activeStepIndex: number;
  spokenStepIndices: Set<number>;
}

export function createGuidanceState(): GuidanceState {
  return { activeStepIndex: 0, spokenStepIndices: new Set() };
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
  const distMeters =
    distanceKm(userLat, userLng, currentStep.endLocation.latitude, currentStep.endLocation.longitude) *
    1000;

  let stepToSpeak: RouteStep | null = null;

  if (!state.spokenStepIndices.has(state.activeStepIndex) && distMeters <= MANEUVER_TRIGGER_METERS) {
    stepToSpeak = currentStep;
    state.spokenStepIndices.add(state.activeStepIndex);
  }

  // Consider the maneuver complete once the user is very close to (or has passed) the
  // step's end point, then advance to the next step.
  if (distMeters <= 25 && state.activeStepIndex < steps.length - 1) {
    state.activeStepIndex += 1;
  }

  return { stepToSpeak, activeStepIndex: state.activeStepIndex };
}
