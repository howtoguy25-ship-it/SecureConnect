import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { CatalogProduct } from '@/types';

// A snapshot of just a product's stock-relevant fields -- used by ProductEditScreen to detect
// whether an edit actually changed stock (vs. an unrelated field like description/price),
// since only an actual stock change should trigger syncProductStock below.
export function stockSignature(product: CatalogProduct): string {
  return JSON.stringify({
    trackInventory: product.trackInventory,
    initialStock: product.initialStock,
    inStock: product.inStock,
    variantStocks: product.variants.map((v) => [v.key, v.initialStock]),
  });
}

// Real, immediate stock/availability update -- see updateProductStock in
// firebase/functions/src/index.ts. Updates the draft product element and, if the site is
// already published, the live storeInventory doc buyers actually check out against, so this
// takes effect right away without needing a full republish.
export async function updateProductStock(
  projectId: string,
  productId: string,
  inStock: boolean,
  stockQuantity: number | null
): Promise<void> {
  const call = httpsCallable<
    { projectId: string; productId: string; inStock: boolean; stockQuantity: number | null },
    { ok: boolean }
  >(requireFunctions(functions), 'updateProductStock');
  await call({ projectId, productId, inStock, stockQuantity });
}

// Pushes a catalog product's current stock to every live storeInventory doc that references
// it (across every one of the seller's published projects) -- see syncProductStock in
// firebase/functions/src/index.ts for why this needs to be a separate, explicit push rather
// than something a plain catalog save or republish already covers.
export async function syncProductStock(productId: string): Promise<void> {
  const call = httpsCallable<{ productId: string }, { ok: boolean; synced: number }>(
    requireFunctions(functions),
    'syncProductStock'
  );
  await call({ productId });
}
