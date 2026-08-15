import { ProductVariant, ProductVariantOption } from '@/types';

export function variantKeyFor(optionValues: string[]): string {
  return optionValues.join('|');
}

export function variantLabelFor(options: ProductVariantOption[], optionValues: string[]): string {
  return options.map((opt, i) => `${opt.name}: ${optionValues[i]}`).join(', ');
}

function cartesianProduct(valuesList: string[][]): string[][] {
  return valuesList.reduce<string[][]>((acc, values) => acc.flatMap((combo) => values.map((v) => [...combo, v])), [[]]);
}

// Regenerates the full variant combination list from the current option values, preserving
// any existing variant's price/stock/sku when its exact combination still exists (e.g. the
// seller just added a new Size value -- every prior combo's overrides should survive), and
// dropping combinations whose values were removed.
export function regenerateVariants(options: ProductVariantOption[], existing: ProductVariant[]): ProductVariant[] {
  const validOptions = options.filter((o) => o.name.trim() && o.values.length > 0);
  if (validOptions.length === 0) return [];
  const combos = cartesianProduct(validOptions.map((o) => o.values));
  const existingByKey = new Map(existing.map((v) => [v.key, v]));
  return combos.map((optionValues) => {
    const key = variantKeyFor(optionValues);
    return existingByKey.get(key) ?? { key, optionValues, priceUsd: null, initialStock: null, sku: null };
  });
}
