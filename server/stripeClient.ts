import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

function getSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set.');
  }
  return secretKey;
}

export async function getUncachableStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(getSecretKey(), {
      apiVersion: '2025-05-28.basil' as any,
    });
  }
  return stripeClient;
}

export async function getStripePublishableKey() {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('STRIPE_PUBLISHABLE_KEY is not set.');
  }
  return publishableKey;
}

export async function getStripeSecretKey() {
  return getSecretKey();
}

/**
 * The Stripe account ID this app operates as (e.g. `acct_…`). Sourced
 * from `STRIPE_ACCOUNT_ID` env var. Useful for:
 * - Logging / sanity-checking which account a deploy is wired to.
 * - Future Connect work (passing as `on_behalf_of` or `Stripe-Account`
 *   header on platform → connected-account calls).
 *
 * We do NOT pass this into checkout/subscription calls today because
 * the app is single-account: the secret key itself already scopes API
 * calls to this account, and passing `on_behalf_of` would only make
 * sense if this app were a Connect platform charging on behalf of
 * connected merchants.
 */
export function getStripeAccountId(): string | undefined {
  return process.env.STRIPE_ACCOUNT_ID;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
