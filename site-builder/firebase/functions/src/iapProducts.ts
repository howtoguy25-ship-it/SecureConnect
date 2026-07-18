import { PlanId } from './types';

// Mirrors app/src/data/iapProducts.ts -- see that file's comment for why this is
// duplicated rather than shared (separate Node project, no shared `@/` alias).

export const SUBSCRIPTION_PRODUCT_IDS: Record<string, Exclude<PlanId, 'free'>> = {
  'com.sitespark.app.sub.beginner': 'beginner',
  'com.sitespark.app.sub.middle': 'middle',
  'com.sitespark.app.sub.advanced': 'advanced',
};

export const CREDIT_PACK_PRODUCT_IDS: Record<string, number> = {
  'com.sitespark.app.credits.12': 12,
  'com.sitespark.app.credits.38': 38,
  'com.sitespark.app.credits.70': 70,
  'com.sitespark.app.credits.200': 200,
};

// Mirrors app/src/data/themes.ts's theme ids per tier -- buying one tier's product
// unlocks every theme currently in that tier.
export const THEME_IDS_BY_PRODUCT: Record<string, string[]> = {
  'com.sitespark.app.theme.luxury': ['luxury-noir', 'luxury-coastal'],
  'com.sitespark.app.theme.luxurycrazy': ['crazy-neon', 'crazy-editorial'],
};

export const MONTHLY_CREDITS_FOR_PLAN: Record<Exclude<PlanId, 'free'>, number> = {
  beginner: 200,
  middle: 460,
  advanced: 1000,
};
