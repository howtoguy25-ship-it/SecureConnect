import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { productsStore } from '@/storage/productsStore';
import { CatalogProduct } from '@/types';

// undefined = still loading, null = no catalog doc exists for this id (old element, or a
// deleted product) -- callers combine this with resolveProductView for a legacy fallback.
export function useCatalogProduct(productId: string): CatalogProduct | null | undefined {
  const { user } = useAuth();
  const [product, setProduct] = useState<CatalogProduct | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setProduct(undefined);
    // Empty id means "not actually a product lookup" (e.g. a shared resolver component called
    // for a non-product target) -- Firestore's doc() throws on an empty path, so short-circuit
    // instead of calling it.
    if (!user || !productId) return;
    productsStore.get(user.uid, productId).then((p) => {
      if (!cancelled) setProduct(p);
    });
    return () => {
      cancelled = true;
    };
  }, [user, productId]);

  return product;
}
