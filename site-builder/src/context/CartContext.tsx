import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { env } from '@/config/env';
import { ProductSaleType } from '@/types';

export interface CartLineItem {
  productId: string;
  variantKey: string | null;
  variantLabel: string | null;
  name: string;
  priceUsd: number;
  saleType: ProductSaleType;
}

export interface CartItem extends CartLineItem {
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  // Checkout looks products up in storeInventory/{slug}, which only exists once the project
  // has actually been published -- callers use this to grey out buy buttons with a clear
  // reason instead of a confusing silent failure on tap.
  canCheckout: boolean;
  processing: boolean;
  addItem: (item: CartLineItem, quantity?: number) => void;
  removeItem: (productId: string, variantKey: string | null) => void;
  checkout: () => Promise<void>;
  buyNow: (item: CartLineItem, quantity?: number) => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

function checkoutEndpoint(): string {
  return `https://us-central1-${env.firebase.projectId}.cloudfunctions.net/createStoreCheckout`;
}

// Same createStoreCheckout HTTP endpoint the published site's own cart/checkout JS calls
// (see renderCartWidget in siteHtml.ts) -- called directly here instead, so "Add to Cart" /
// "Buy Now" in the editor's own product preview are real, working purchases against the
// seller's actual live Stripe Checkout, not a mockup.
async function startCheckout(slug: string, items: { productId: string; quantity: number; variantKey?: string }[]): Promise<void> {
  const res = await fetch(checkoutEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, items }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.checkoutUrl) {
    throw new Error(data.error || 'Could not start checkout.');
  }
  await WebBrowser.openBrowserAsync(data.checkoutUrl);
}

export function CartProvider({
  publishSlug,
  children,
}: {
  publishSlug: string | null | undefined;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [processing, setProcessing] = useState(false);

  const addItem = useCallback((item: CartLineItem, quantity: number = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === item.productId && i.variantKey === item.variantKey);
      if (existing) {
        return prev.map((i) => (i === existing ? { ...i, quantity: i.quantity + quantity } : i));
      }
      return [...prev, { ...item, quantity }];
    });
  }, []);

  const removeItem = useCallback((productId: string, variantKey: string | null) => {
    setItems((prev) => prev.filter((i) => !(i.productId === productId && i.variantKey === variantKey)));
  }, []);

  const checkout = useCallback(async () => {
    if (!publishSlug || items.length === 0) return;
    setProcessing(true);
    try {
      await startCheckout(
        publishSlug,
        items.map((i) => ({ productId: i.productId, quantity: i.quantity, variantKey: i.variantKey ?? undefined }))
      );
      setItems([]);
    } finally {
      setProcessing(false);
    }
  }, [publishSlug, items]);

  const buyNow = useCallback(
    async (item: CartLineItem, quantity: number = 1) => {
      if (!publishSlug) return;
      setProcessing(true);
      try {
        await startCheckout(publishSlug, [{ productId: item.productId, quantity, variantKey: item.variantKey ?? undefined }]);
      } finally {
        setProcessing(false);
      }
    },
    [publishSlug]
  );

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const value = useMemo<CartContextValue>(
    () => ({ items, itemCount, canCheckout: !!publishSlug, processing, addItem, removeItem, checkout, buyNow }),
    [items, itemCount, publishSlug, processing, addItem, removeItem, checkout, buyNow]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// Returns an inert, always-disabled cart when rendered with no CartProvider above it (e.g. a
// project thumbnail or a static preview) rather than throwing -- ElementRenderer is shared by
// contexts with no real storefront behind them.
const INERT_CART: CartContextValue = {
  items: [],
  itemCount: 0,
  canCheckout: false,
  processing: false,
  addItem: () => {},
  removeItem: () => {},
  checkout: async () => {},
  buyNow: async () => {},
};

export function useCart(): CartContextValue {
  return useContext(CartContext) ?? INERT_CART;
}
