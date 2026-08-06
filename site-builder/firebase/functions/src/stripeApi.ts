import Stripe from 'stripe';

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey);
}

export interface CheckoutSessionParams {
  domain: string;
  priceUsd: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export async function createCheckoutSession(stripe: Stripe, params: CheckoutSessionParams): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `Domain registration: ${params.domain}` },
          unit_amount: Math.round(params.priceUsd * 100),
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
}

export interface SubscriptionCheckoutParams {
  planName: string;
  priceUsd: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

// Real recurring billing for the web app's equivalent of an Apple subscription -- uses
// inline `price_data` with a `recurring` interval instead of a pre-created Stripe Price
// object, so no manual Stripe Dashboard setup is needed to add or change a plan; the price
// here (src/pricing.ts's WEB_PLAN_PRICES) is the only source of truth to keep in sync.
// `subscription_data.metadata` copies the same metadata onto the Subscription object itself
// (not just this Checkout Session), since renewal invoices reference the subscription, not
// the session that created it.
export async function createSubscriptionCheckoutSession(
  stripe: Stripe,
  params: SubscriptionCheckoutParams
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `SiteSpark ${params.planName} plan` },
          unit_amount: Math.round(params.priceUsd * 100),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
    subscription_data: { metadata: params.metadata },
  });
}

export interface OneTimeCheckoutParams {
  name: string;
  priceUsd: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

// Real one-time billing for the web app's equivalent of an Apple consumable IAP (credit
// packs) -- same inline `price_data` approach as domain checkout above, just generalized
// with a caller-supplied product name instead of always "Domain registration: ...".
export async function createOneTimeCheckoutSession(stripe: Stripe, params: OneTimeCheckoutParams): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: params.name },
          unit_amount: Math.round(params.priceUsd * 100),
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
}
