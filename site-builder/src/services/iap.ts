import {
  initConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  restorePurchases as restorePurchasesNative,
  getAvailablePurchases,
  Purchase,
  Product,
  ProductSubscription,
} from 'expo-iap';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { SUBSCRIPTION_SKUS, CONSUMABLE_SKUS, NON_CONSUMABLE_SKUS } from '@/data/iapProducts';

let connected = false;

export async function ensureIapConnection(): Promise<void> {
  if (connected) return;
  await initConnection();
  connected = true;
}

export async function loadIapCatalog(): Promise<{ subscriptions: ProductSubscription[]; products: Product[] }> {
  await ensureIapConnection();
  const [subscriptions, products] = await Promise.all([
    fetchProducts({ skus: SUBSCRIPTION_SKUS, type: 'subs' }) as Promise<ProductSubscription[]>,
    fetchProducts({ skus: [...CONSUMABLE_SKUS, ...NON_CONSUMABLE_SKUS], type: 'in-app' }) as Promise<Product[]>,
  ]);
  return { subscriptions, products };
}

async function verifyPurchaseServerSide(transactionId: string): Promise<void> {
  const call = httpsCallable<{ transactionId: string }, { productId?: string; alreadyProcessed?: boolean }>(
    requireFunctions(functions),
    'verifyApplePurchase'
  );
  await call({ transactionId });
}

// Attach while a purchase-capable screen is mounted -- the real effect (credits/plan/
// theme unlock) only ever happens server-side in verifyApplePurchase; this just drives
// that verification and tells StoreKit the transaction is done once it succeeds.
export function attachPurchaseListeners(
  onApplied: (productId: string) => void,
  onError: (message: string) => void
): () => void {
  const updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    try {
      const transactionId = purchase.transactionId ?? purchase.id;
      if (!transactionId) throw new Error('Missing transaction id from StoreKit.');
      await verifyPurchaseServerSide(transactionId);
      await finishTransaction({ purchase, isConsumable: CONSUMABLE_SKUS.includes(purchase.productId) });
      onApplied(purchase.productId);
    } catch (err: any) {
      onError(err?.message ?? 'Purchase could not be verified.');
    }
  });
  const errorSub = purchaseErrorListener((error) => {
    onError(error.message ?? 'Purchase failed.');
  });
  return () => {
    updateSub.remove();
    errorSub.remove();
  };
}

export async function buySubscription(sku: string): Promise<void> {
  await ensureIapConnection();
  await requestPurchase({ request: { apple: { sku } }, type: 'subs' });
}

export async function buyProduct(sku: string): Promise<void> {
  await ensureIapConnection();
  await requestPurchase({ request: { apple: { sku } }, type: 'in-app' });
}

// Required by App Store guideline 3.1.2 for any app selling non-consumables/subscriptions
// (the luxury theme unlocks, and the plan subscriptions) -- lets someone who reinstalled
// the app, or signed in on a new device, get back what they already paid Apple for.
// restorePurchases() alone only re-syncs StoreKit's own record of what was bought; each
// restored purchase still has to go through the same server-side verifyApplePurchase every
// fresh purchase does, since that's what actually re-grants credits/plan/theme access.
export async function restorePurchases(): Promise<number> {
  await ensureIapConnection();
  await restorePurchasesNative();
  const purchases = await getAvailablePurchases();

  let restoredCount = 0;
  for (const purchase of purchases) {
    try {
      const transactionId = purchase.transactionId ?? purchase.id;
      if (!transactionId) continue;
      await verifyPurchaseServerSide(transactionId);
      await finishTransaction({ purchase, isConsumable: false });
      restoredCount++;
    } catch {
      // Skip purchases that fail to verify (e.g. already applied, or from a different
      // account) rather than letting one bad entry block the rest of the restore.
    }
  }
  return restoredCount;
}
