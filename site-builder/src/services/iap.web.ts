import { Product, ProductSubscription } from 'expo-iap';

// expo-iap wraps StoreKit/Play Billing -- there's no such thing as an Apple/Google
// in-app purchase from a browser tab, so none of this can be "made to work" on web the
// way the native purchase flow does. Rather than let expo-iap's native-module-not-found
// error surface as a cryptic message, every export here gives an honest, specific
// explanation instead -- purchases and their restoration only ever happen in the iOS app.
const WEB_PURCHASE_MESSAGE =
  'Purchases are only available in the SiteSpark iOS app. Download it from the App Store and sign in with the same account.';
const WEB_RESTORE_MESSAGE =
  'Restoring purchases is only available in the SiteSpark iOS app. Sign in there with the same account to restore your subscription or credits.';

export async function loadIapCatalog(): Promise<{ subscriptions: ProductSubscription[]; products: Product[] }> {
  // Empty catalog -- SubscriptionScreen/ThemeGalleryScreen already fall back to their
  // hardcoded price text whenever a product's real price isn't available (see the
  // livePrices fallback added alongside this), so this doesn't leave prices blank.
  return { subscriptions: [], products: [] };
}

export function attachPurchaseListeners(
  _onApplied: (productId: string) => void,
  _onError: (message: string) => void
): () => void {
  // No purchases ever happen on web, so there's nothing to listen for.
  return () => {};
}

export async function buySubscription(_sku: string): Promise<void> {
  throw new Error(WEB_PURCHASE_MESSAGE);
}

export async function buyProduct(_sku: string): Promise<void> {
  throw new Error(WEB_PURCHASE_MESSAGE);
}

export async function restorePurchases(): Promise<number> {
  throw new Error(WEB_RESTORE_MESSAGE);
}
