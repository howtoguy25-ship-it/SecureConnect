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
