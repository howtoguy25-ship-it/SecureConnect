import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { functions, db } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { requireDb } from '@/services/requireDb';
import { SellerAccount, StoreOrder } from '@/types';

// Real Stripe Express Connect onboarding for sellers -- see stripeConnect.ts /
// createSellerOnboardingLink in Cloud Functions. Opens Stripe's own hosted flow (identity,
// bank details, tax info) in an in-app browser; SiteSpark never sees any of it directly.
export async function createSellerOnboardingLink(): Promise<string> {
  const call = httpsCallable<undefined, { url: string }>(requireFunctions(functions), 'createSellerOnboardingLink');
  const result = await call();
  return result.data.url;
}

export async function refreshSellerAccountStatus(): Promise<Pick<SellerAccount, 'onboardingStatus' | 'chargesEnabled' | 'payoutsEnabled'>> {
  const call = httpsCallable<undefined, Pick<SellerAccount, 'onboardingStatus' | 'chargesEnabled' | 'payoutsEnabled'>>(
    requireFunctions(functions),
    'getSellerAccountStatus'
  );
  const result = await call();
  return result.data;
}

// A real link into the seller's own Stripe Express dashboard -- their actual balance,
// payout schedule/history, and payment records, hosted entirely by Stripe.
export async function createSellerDashboardLink(): Promise<string> {
  const call = httpsCallable<undefined, { url: string }>(requireFunctions(functions), 'createSellerDashboardLink');
  const result = await call();
  return result.data.url;
}

export const sellerAccountStore = {
  subscribe(uid: string, onChange: (account: SellerAccount | null) => void): () => void {
    return onSnapshot(doc(requireDb(db), 'users', uid, 'meta', 'sellerAccount'), (snap) => {
      onChange(snap.exists() ? (snap.data() as SellerAccount) : null);
    });
  },
};

export const ordersStore = {
  subscribe(uid: string, onChange: (orders: StoreOrder[]) => void): () => void {
    const q = query(collection(requireDb(db), 'users', uid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => d.data() as StoreOrder));
    });
  },
};
