import { PlanId } from '@/data/pricing';

// Real Apple product IDs -- must exactly match what's created in App Store Connect
// (Monetization -> Subscriptions / In-App Purchases). See ROADMAP.md Phase 4 for the
// full list with prices.

export const SUBSCRIPTION_PRODUCT_IDS: Record<Exclude<PlanId, 'free'>, string> = {
  beginner: 'com.sitespark.app.sub.beginner',
  middle: 'com.sitespark.app.sub.middle',
  advanced: 'com.sitespark.app.sub.advanced',
};

export const CREDIT_PACK_PRODUCT_IDS: Record<string, string> = {
  'pack-12': 'com.sitespark.app.credits.12',
  'pack-38': 'com.sitespark.app.credits.38',
  'pack-70': 'com.sitespark.app.credits.70',
  'pack-200': 'com.sitespark.app.credits.200',
};

// One product per theme *tier* (not per individual theme) -- buying it unlocks every
// theme currently in that tier, rather than charging separately per theme design.
export const THEME_TIER_PRODUCT_IDS: Record<'luxury' | 'luxury-crazy', string> = {
  luxury: 'com.sitespark.app.theme.luxury',
  'luxury-crazy': 'com.sitespark.app.theme.luxurycrazy',
};

export const ALL_IAP_PRODUCT_IDS: string[] = [
  ...Object.values(SUBSCRIPTION_PRODUCT_IDS),
  ...Object.values(CREDIT_PACK_PRODUCT_IDS),
  ...Object.values(THEME_TIER_PRODUCT_IDS),
];

export const SUBSCRIPTION_SKUS = Object.values(SUBSCRIPTION_PRODUCT_IDS);
export const CONSUMABLE_SKUS = Object.values(CREDIT_PACK_PRODUCT_IDS);
export const NON_CONSUMABLE_SKUS = Object.values(THEME_TIER_PRODUCT_IDS);
