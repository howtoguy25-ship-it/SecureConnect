import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { functions, db } from '@/services/firebase';
import { requireFunctions } from '@/services/requireFunctions';
import { requireDb } from '@/services/requireDb';
import { SellerAccount, StoreOrder, DiscountCode, DiscountType, DiscountKind, FulfillmentStatus } from '@/types';

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

// A flat USD fee charged as its own line item at checkout whenever the cart needs real
// shipping -- see createStoreCheckout in Cloud Functions. Pass null to stop charging one.
export async function setShippingFee(shippingFeeUsd: number | null): Promise<void> {
  const call = httpsCallable<{ shippingFeeUsd: number | null }, { ok: boolean }>(requireFunctions(functions), 'setShippingFee');
  await call({ shippingFeeUsd });
}

export const sellerAccountStore = {
  subscribe(uid: string, onChange: (account: SellerAccount | null) => void): () => void {
    return onSnapshot(doc(requireDb(db), 'users', uid, 'meta', 'sellerAccount'), (snap) => {
      onChange(snap.exists() ? (snap.data() as SellerAccount) : null);
    });
  },
};

// Moves an order through unfulfilled -> shipped -> delivered (or marks it cancelled) and
// attaches real carrier/tracking info -- see updateOrderFulfillment in Cloud Functions for
// why this sends a shipping-notification email to the buyer the moment it's marked shipped.
export async function updateOrderFulfillment(params: {
  orderId: string;
  fulfillmentStatus: FulfillmentStatus;
  trackingCarrier?: string | null;
  trackingNumber?: string | null;
}): Promise<void> {
  const call = httpsCallable<typeof params, { ok: boolean }>(requireFunctions(functions), 'updateOrderFulfillment');
  await call(params);
}

export const ordersStore = {
  subscribe(uid: string, onChange: (orders: StoreOrder[]) => void): () => void {
    const q = query(collection(requireDb(db), 'users', uid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => d.data() as StoreOrder));
    });
  },
};

// Real promo codes redeemable at checkout on any of a seller's published stores -- see
// createDiscountCode/setDiscountCodeActive/deleteDiscountCode in Cloud Functions for why
// these always go through callables rather than direct Firestore writes.
export async function createDiscountCode(params: {
  code: string;
  kind: DiscountKind;
  type: DiscountType;
  amount: number;
  targetProductName?: string | null;
  bogoBuyQuantity?: number | null;
  bogoGetQuantity?: number | null;
  maxRedemptions: number | null;
  startsAt?: number | null;
  expiresAt: number | null;
  announceOnSite?: boolean;
  announceDurationMs?: number | null;
}): Promise<void> {
  const call = httpsCallable<typeof params, { ok: boolean }>(requireFunctions(functions), 'createDiscountCode');
  await call(params);
}

export async function setDiscountCodeActive(code: string, active: boolean): Promise<void> {
  const call = httpsCallable<{ code: string; active: boolean }, { ok: boolean }>(requireFunctions(functions), 'setDiscountCodeActive');
  await call({ code, active });
}

// Turns the real on-site announcement banner on (re-triggering its display window) or off
// for a code that already exists -- see setDiscountCodeAnnouncement in Cloud Functions.
export async function setDiscountCodeAnnouncement(code: string, announceOnSite: boolean, announceDurationMs?: number | null): Promise<void> {
  const call = httpsCallable<{ code: string; announceOnSite: boolean; announceDurationMs?: number | null }, { ok: boolean }>(
    requireFunctions(functions),
    'setDiscountCodeAnnouncement'
  );
  await call({ code, announceOnSite, announceDurationMs });
}

export async function deleteDiscountCode(code: string): Promise<void> {
  const call = httpsCallable<{ code: string }, { ok: boolean }>(requireFunctions(functions), 'deleteDiscountCode');
  await call({ code });
}

export const discountCodesStore = {
  subscribe(uid: string, onChange: (codes: DiscountCode[]) => void): () => void {
    const q = query(collection(requireDb(db), 'users', uid, 'discountCodes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      onChange(snap.docs.map((d) => d.data() as DiscountCode));
    });
  },
};
