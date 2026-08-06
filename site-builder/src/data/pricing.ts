export type PlanId = 'free' | 'beginner' | 'middle' | 'advanced';

export interface Plan {
  id: PlanId;
  name: string;
  priceLabel: string;
  priceUsd: number;
  billingPeriod: 'monthly' | 'weekly-reset';
  monthlyCredits: number;
  buildCostRange: [number, number];
  addOnMinuteCost: number;
  aiTier: 'rabbit' | 'fox' | 'jaguar';
  aiTierLabel: string;
  aiSpeedMultiplier: number;
  minimumUsageNote?: string;
}

export const FREE_SIGNUP_CREDITS = 38;

// Mirrors firebase/functions/src/pricing.ts's BACKGROUND_EDIT_CREDIT_COST -- display only,
// that copy is authoritative since credits are deducted server-side.
export const BACKGROUND_EDIT_CREDIT_COST = 3;

// Mirrors firebase/functions/src/pricing.ts's CUSTOM_WIDGET_CREDIT_COST -- display only.
export const CUSTOM_WIDGET_CREDIT_COST = 6;

// Plan pricing/credit mechanics exactly as specified in the product brief. Kept as one
// source of truth here for client display; firebase/functions/src/pricing.ts mirrors this
// (Cloud Functions run in a separate Node project, so it can't import straight from here --
// see the comment there for how to keep the two in sync).
export const PLANS: Plan[] = [
  {
    id: 'beginner',
    name: 'Beginner',
    priceLabel: '$64.99/mo',
    priceUsd: 64.99,
    billingPeriod: 'monthly',
    monthlyCredits: 200,
    buildCostRange: [15, 30],
    addOnMinuteCost: 3,
    aiTier: 'rabbit',
    aiTierLabel: 'Rabbit',
    aiSpeedMultiplier: 1.5,
  },
  {
    id: 'middle',
    name: 'Middle Class',
    priceLabel: '$109.99/mo',
    priceUsd: 109.99,
    billingPeriod: 'weekly-reset',
    monthlyCredits: 460,
    buildCostRange: [25, 40],
    addOnMinuteCost: 4,
    aiTier: 'fox',
    aiTierLabel: 'Fox',
    aiSpeedMultiplier: 3,
    minimumUsageNote: 'Requires at least 1 build (or 2 minutes of active building) per week to receive that week’s credit refresh.',
  },
  {
    id: 'advanced',
    name: 'Advanced',
    priceLabel: '$149.99/mo',
    priceUsd: 149.99,
    billingPeriod: 'monthly',
    monthlyCredits: 1000,
    buildCostRange: [50, 75],
    addOnMinuteCost: 6,
    aiTier: 'jaguar',
    aiTierLabel: 'Jaguar',
    aiSpeedMultiplier: 5,
  },
];

export interface CreditPack {
  id: string;
  credits: number;
  priceUsd: number;
  priceLabel: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack-12', credits: 12, priceUsd: 15.99, priceLabel: '$15.99' },
  { id: 'pack-38', credits: 38, priceUsd: 35.99, priceLabel: '$35.99' },
  { id: 'pack-70', credits: 70, priceUsd: 66.99, priceLabel: '$66.99' },
  { id: 'pack-200', credits: 200, priceUsd: 102.99, priceLabel: '$102.99' },
];

export type BuildComplexity = 'simple' | 'standard' | 'crazy';

export const COMPLEXITY_INFO: Record<BuildComplexity, { label: string; description: string }> = {
  simple: { label: 'Simple', description: 'A clean, minimal site — fastest to build, lowest credit cost.' },
  standard: { label: 'Professional', description: 'A polished, full-featured site — the default for most builds.' },
  crazy: { label: 'Go All Out', description: 'Maximum detail and creative flair — costs more credits and can take longer.' },
};

export function getPlan(id: PlanId): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

// Mirrors firebase/functions/src/pricing.ts's computeBuildCost -- that copy is the one
// that's authoritative (credits are deducted server-side); this one is only for showing
// an upfront estimate before the user taps Generate. Kept in sync by hand -- see that
// file's comment for why Cloud Functions can't just import this module directly.
export function computeBuildCost(plan: PlanId, complexity: BuildComplexity): number {
  const [min, max] = plan === 'free' ? PLANS[0].buildCostRange : (getPlan(plan)?.buildCostRange ?? PLANS[0].buildCostRange);
  if (complexity === 'simple') return min;
  if (complexity === 'crazy') return max;
  return Math.round((min + max) / 2);
}

// A real, honest [min, max] minute range per tier -- not a marketing number. Section images
// generate in parallel (see index.ts's startGeneration), so wall-clock time tracks section
// COUNT and per-image quality far more than a flat "it's fancier" multiplier: Simple is 3
// sections with at most one 'medium'-quality image; Professional is 4-5 sections with an
// image on every visual one, plus assembling the real nav bar/announcement bar this tier
// adds; Go All Out is the full 6 sections, an image on every visual one at 'high' quality
// (a real, slower generation call -- see generateImage's own comment), two announcement
// bars, and the same nav bar assembly. Real network/API variance means any single build can
// land outside its own range, but this reflects the actual mechanics, not a guess.
export const BUILD_TIME_ESTIMATE_MINUTES: Record<BuildComplexity, [number, number]> = {
  simple: [1, 2],
  standard: [2, 4],
  crazy: [4, 7],
};

export function estimateBuildMinutes(complexity: BuildComplexity): [number, number] {
  return BUILD_TIME_ESTIMATE_MINUTES[complexity];
}
