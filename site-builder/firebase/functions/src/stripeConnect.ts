import Stripe from 'stripe';

// Real Stripe Express Connect accounts -- how money from a store sale actually reaches a
// site owner's own bank account. SiteSpark never holds seller funds itself: at checkout
// time, Stripe splits the payment directly (see createStoreCheckout in index.ts), and each
// account has its own Stripe-hosted dashboard for viewing balance/payout history
// (createDashboardLoginLink below) -- SiteSpark doesn't need to build a payout ledger UI
// of its own, Stripe already has one per connected account.

export async function ensureExpressAccount(stripe: Stripe, existingAccountId: string | null, email: string | undefined): Promise<string> {
  if (existingAccountId) return existingAccountId;
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account.id;
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
