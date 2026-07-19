import { PlanId } from './types';

// Mirrors app/src/data/pricing.ts -- see that file's comment for why this is duplicated
// rather than shared. This copy is the one that's actually authoritative for credit
// deduction, since it runs server-side.

export const FREE_SIGNUP_CREDITS = 30;

const BUILD_COST_RANGE: Record<Exclude<PlanId, 'free'>, [number, number]> = {
  beginner: [15, 30],
  middle: [25, 40],
  advanced: [50, 75],
};

// A free/new user hasn't picked a plan yet -- price their build like Beginner tier so the
// upfront cost check is meaningful before they've subscribed to anything.
function costRangeForPlan(plan: PlanId): [number, number] {
  return plan === 'free' ? BUILD_COST_RANGE.beginner : BUILD_COST_RANGE[plan];
}

export type BuildComplexity = 'simple' | 'standard' | 'crazy';

export function computeBuildCost(plan: PlanId, complexity: BuildComplexity): number {
  const [min, max] = costRangeForPlan(plan);
  if (complexity === 'simple') return min;
  if (complexity === 'crazy') return max;
  return Math.round((min + max) / 2);
}

const ADD_ON_MINUTE_COST: Record<Exclude<PlanId, 'free'>, number> = {
  beginner: 3,
  middle: 4,
  advanced: 6,
};

export function addOnMinuteCost(plan: PlanId): number {
  return plan === 'free' ? ADD_ON_MINUTE_COST.beginner : ADD_ON_MINUTE_COST[plan];
}

// AI "tier" per plan (speed/strength framing from the product brief) -- maps to actual
// OpenAI model choice + reasoning effort, since that's what really varies performance.
export const MODEL_FOR_PLAN: Record<PlanId, string> = {
  free: 'gpt-4o-mini',
  beginner: 'gpt-4o-mini',
  middle: 'gpt-4o',
  advanced: 'gpt-4o',
};
