// Base file — exists only so TypeScript (which doesn't do Metro's
// .native/.web platform-file resolution) has something to type-check
// against. At runtime, Metro always picks useStripePayments.native.ts
// (iOS/Android) or useStripePayments.web.ts (web) instead of this file.
export function useStripePayments() {
  const payWithCard = async (_clientSecret: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => {
    return { success: false, error: "Stripe is not available." };
  };
  return { payWithCard, supported: false };
}
