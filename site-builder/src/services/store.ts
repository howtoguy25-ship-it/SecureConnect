import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { functions, db } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { requireDb } from '@/services/requireDb';
import { SellerAccount, StoreOrder } from '@/types';

// Real Stripe Express Connect onboarding for sellers -- see stripeConnect.ts /
// createSellerOnboardingLink in Cloud Functions. Opens Stripe's own hosted flow (identity,
// bank details, tax info) in an in-app browser; SiteSpark never sees any of it directly.
// `country` (ISO 3166-1 alpha-2, e.g. "AU") is the seller's own device region -- Stripe fixes
// an Express account's country permanently at creation, and without this it silently defaults
// to the *platform* account's own country instead of the seller's, which breaks the hosted
// onboarding form for anyone outside that country (see SellerAccountScreen for how this is
// determined and resetSellerOnboarding for recovering an account already created without it).
export async function createSellerOnboardingLink(country: string): Promise<string> {
  const call = httpsCallable<{ country: string }, { url: string }>(requireFunctions(functions), 'createSellerOnboardingLink');
  const result = await call({ country });
  return result.data.url;
}

// Abandons a seller's current Stripe Express account and clears the local record, so the next
// createSellerOnboardingLink call creates a fresh one -- the only way to recover an account
// that was created under the wrong country, since Stripe never allows changing it afterward.
// The server refuses this once the account is already active (chargesEnabled), so it can't be
// used to destroy a real, working payout account.
export async function resetSellerOnboarding(): Promise<void> {
  const call = httpsCallable<undefined, { ok: boolean }>(requireFunctions(functions), 'resetSellerOnboarding');
  await call();
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
