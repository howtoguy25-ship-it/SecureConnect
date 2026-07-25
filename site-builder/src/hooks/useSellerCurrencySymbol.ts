import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { sellerAccountStore } from '@/services/store';
import { currencySymbol } from '@/utils/currency';

// Shared by anything that shows a real price in the editor (product cards, the cart sheet)
// -- one seller currency, set once on their account, not per-element.
export function useSellerCurrencySymbol(): string {
  const { user } = useAuth();
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!user) return;
    return sellerAccountStore.subscribe(user.uid, (account) => setCurrency(account?.currency));
  }, [user]);
  return currencySymbol(currency);
}
