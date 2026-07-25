import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';

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
