import Stripe from 'stripe';

// Real Stripe Express Connect accounts -- how money from a store sale actually reaches a
// site owner's own bank account. SiteSpark never holds seller funds itself: at checkout
// time, Stripe splits the payment directly (see createStoreCheckout in index.ts), and each
// account has its own Stripe-hosted dashboard for viewing balance/payout history
// (createDashboardLoginLink below) -- SiteSpark doesn't need to build a payout ledger UI
// of its own, Stripe already has one per connected account.

export async function ensureExpressAccount(
  stripe: Stripe,
  existingAccountId: string | null,
  email: string | undefined,
  country: string
): Promise<string> {
  if (existingAccountId) return existingAccountId;
  // Leaving `country` unset here defaults a new Express account to the *platform* Stripe
  // account's own country, not the seller's -- so a seller physically outside that country
  // (e.g. providing an AU phone number/bank details) would hit Stripe's hosted onboarding
  // form and see a generic "Something went wrong. Please try again." validation failure,
  // since their real-world details don't match the country the account was silently created
  // under. Passing the seller's own country (from their device locale, see
  // createSellerOnboardingLink) fixes this at the source.
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    country,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account.id;
}

// Stripe fixes an Express account's country permanently at creation -- there is no API to
// change it afterward. A seller whose account was created with the wrong country (e.g. the
// old code path that always defaulted to the platform's own country) can only recover by
// abandoning that account and starting fresh with the correct one, which is what this
// supports: only ever called on an account that hasn't actually gone live yet (see the
// chargesEnabled guard in index.ts), so there's no real payout history or balance at risk.
export async function deleteExpressAccount(stripe: Stripe, accountId: string): Promise<void> {
  await stripe.accounts.del(accountId);
}

// A hosted onboarding flow (identity, bank details, tax info) -- Stripe handles all of
// this directly, SiteSpark never sees or stores any of it.
export async function createOnboardingLink(stripe: Stripe, accountId: string, refreshUrl: string, returnUrl: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return link.url;
}

export interface AccountFlags {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export async function getAccountFlags(stripe: Stripe, accountId: string): Promise<AccountFlags> {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
    detailsSubmitted: !!account.details_submitted,
  };
}

// A real link into that seller's own Stripe Express dashboard -- balance, payout
// schedule/history, and payment records for their store, hosted entirely by Stripe.
export async function createDashboardLoginLink(stripe: Stripe, accountId: string): Promise<string> {
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}
