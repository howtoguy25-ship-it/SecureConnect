import { Product, ProductSubscription } from 'expo-iap';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { SUBSCRIPTION_PRODUCT_IDS, CREDIT_PACK_PRODUCT_IDS } from '@/data/iapProducts';

// expo-iap wraps StoreKit -- there's no such thing as an Apple in-app purchase from a
// browser tab, so the web app bills through a real Stripe Checkout session instead (see
// createWebBillingCheckout in firebase/functions/src/index.ts). SubscriptionScreen.tsx is
// unaware of the difference: it still calls buySubscription/buyProduct with the same Apple
// product id strings it always has, so those are reverse-mapped back to a plan/pack id here.
const SKU_TO_PLAN_ID: Record<string, string> = Object.fromEntries(
  Object.entries(SUBSCRIPTION_PRODUCT_IDS).map(([planId, sku]) => [sku, planId])
);
const SKU_TO_PACK_ID: Record<string, string> = Object.fromEntries(
  Object.entries(CREDIT_PACK_PRODUCT_IDS).map(([packId, sku]) => [sku, packId])
);

async function createCheckoutUrl(kind: 'subscription' | 'creditpack', id: string): Promise<string> {
  const call = httpsCallable<{ kind: string; id: string }, { url: string }>(requireFunctions(functions), 'createWebBillingCheckout');
  const { data } = await call({ kind, id });
  return data.url;
}

export async function loadIapCatalog(): Promise<{ subscriptions: ProductSubscription[]; products: Product[] }> {
  // Empty catalog -- SubscriptionScreen/ThemeGalleryScreen already fall back to their
  // hardcoded price text whenever a product's real price isn't available (see the
  // livePrices fallback added alongside this), so this doesn't leave prices blank. Real
  // web prices come straight from src/data/pricing.ts, same as the fallback itself.
  return { subscriptions: [], products: [] };
}

export function attachPurchaseListeners(
  _onApplied: (productId: string) => void,
  _onError: (message: string) => void
): () => void {
  // Checkout redirects the whole page to Stripe and back -- there's no in-page purchase
  // event to listen for the way StoreKit has one. SubscriptionScreen instead checks the
  // ?checkout= query param left by the redirect (see its own effect) once the page reloads.
  return () => {};
}

// Navigates the whole tab to Stripe's hosted Checkout page -- unlike a native purchase
// sheet, there's no "return to the same screen" concept on web, so this never resolves
// normally (the page is about to unload). See SubscriptionScreen's ?checkout= handling for
// what happens after the redirect back.
export async function buySubscription(sku: string): Promise<void> {
  const planId = SKU_TO_PLAN_ID[sku];
  if (!planId) throw new Error('That plan is not available for web purchase.');
  const url = await createCheckoutUrl('subscription', planId);
  window.location.assign(url);
}

export async function buyProduct(sku: string): Promise<void> {
  const packId = SKU_TO_PACK_ID[sku];
  if (!packId) throw new Error('That item is not available for web purchase.');
  const url = await createCheckoutUrl('creditpack', packId);
  window.location.assign(url);
}

// There's no separate client-side purchase record to "restore" on web the way StoreKit
// has one -- signing in already shows this account's real, live credits/plan straight from
// Firestore, updated the moment Stripe's webhook processes a payment. See AccountScreen's
// web-specific handling of this button for the user-facing explanation.
export async function restorePurchases(): Promise<number> {
  return 0;
}

// Opens a real Stripe-hosted page where a web subscriber can update their card, view past
// invoices, or cancel -- the honest equivalent of "manage from your Apple ID settings" for
// whoever paid through the web app instead of Apple IAP.
export async function openBillingPortal(): Promise<void> {
  const call = httpsCallable<Record<string, never>, { url: string }>(requireFunctions(functions), 'createStripeBillingPortalSession');
  const { data } = await call({});
  window.location.assign(data.url);
}
