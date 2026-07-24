import { CatalogProduct, ProductElement } from '@/types';

// A read-only "resolved" view of a product for rendering, whether it comes from a real
// catalog doc (users/{uid}/products) or -- for elements stored before the catalog existed --
// whatever inline fields still happen to be sitting on the element object at runtime
// (TypeScript no longer declares them on ProductElement, but nothing has gone back and
// stripped them from already-stored data, so this reads them as a graceful fallback instead
// of a product silently going blank). New/edited products always go through the catalog, so
// this fallback only ever matters for old, never-touched-since elements.
export function resolveProductView(element: ProductElement, catalogProduct: CatalogProduct | null): CatalogProduct {
  if (catalogProduct) return catalogProduct;
  const legacy = element as unknown as Partial<CatalogProduct>;
  return {
    id: element.productId,
    name: legacy.name ?? 'Untitled product',
    description: legacy.description ?? '',
    priceUsd: legacy.priceUsd ?? 0,
    compareAtPriceUsd: legacy.compareAtPriceUsd ?? null,
    costUsd: legacy.costUsd ?? null,
    images: legacy.images ?? [],
    trackInventory: legacy.trackInventory ?? false,
    initialStock: legacy.initialStock ?? null,
    inStock: legacy.inStock ?? true,
    saleType: legacy.saleType ?? 'product',
    fulfillment: legacy.fulfillment ?? 'pickup',
    serviceDurationMinutes: legacy.serviceDurationMinutes ?? null,
    variantOptions: legacy.variantOptions ?? [],
    variants: legacy.variants ?? [],
    createdAt: legacy.createdAt ?? 0,
    updatedAt: legacy.updatedAt ?? 0,
  };
}
