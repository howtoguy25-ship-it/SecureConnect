import { useCallback } from "react";
import { apiRequest } from "@/lib/query-client";

// Module-scoped so the publishable key is only fetched and initStripe only
// called once per app session, no matter how many screens use this hook.
let cachedKey: string | null = null;
let initialized = false;

// CRITICAL: @stripe/stripe-react-native's native module spec calls
// TurboModuleRegistry.getEnforcing('StripeSdk') at IMPORT time (a
// module-level side effect, not something deferred to first use) — on a
// binary that doesn't have the native module compiled in (any build before
// this feature's own native build ships), merely importing the package
// throws synchronously. A previous version of this file statically
// `import`ed the package at the top, which pulled that crash into
// ConversationScreen's module graph — loaded on every app launch via
// RootStackNavigator's static import chain, regardless of whether any
// Stripe UI was ever shown. Never statically import this package anywhere
// reachable from common app code; only ever reach it through this dynamic
// import, deferred until a user actually taps "Pay with Card."
async function ensureInitialized(): Promise<typeof import("@stripe/stripe-react-native") | null> {
  try {
    const Stripe = await import("@stripe/stripe-react-native");
    if (!initialized) {
      if (!cachedKey) {
        const res = await apiRequest("GET", "/api/payments/stripe/publishable-key");
        const data = await res.json();
        cachedKey = data.publishableKey ?? null;
      }
      if (!cachedKey) return null;
      await Stripe.initStripe({ publishableKey: cachedKey, merchantIdentifier: "merchant.com.adham.salameh.secureconnectchat" });
      initialized = true;
    }
    return Stripe;
  } catch (e) {
    console.error("[stripe] init failed:", e);
    return null;
  }
}

/**
 * Wraps Stripe's PaymentSheet for a single "pay this PaymentIntent" step —
 * the real card-entry UI, not a stub. Uses the SDK's plain (non-hook)
 * initPaymentSheet/presentPaymentSheet functions rather than useStripe(),
 * specifically so nothing here needs the native module to exist until this
 * function actually runs — see ensureInitialized's comment above.
 */
export function useStripePayments() {
  const payWithCard = useCallback(async (clientSecret: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => {
    const Stripe = await ensureInitialized();
    if (!Stripe) return { success: false, error: "Stripe is not available right now." };

    const initResult = await Stripe.initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: "Pryvo",
    });
    if (initResult.error) return { success: false, error: initResult.error.message };

    const presentResult = await Stripe.presentPaymentSheet();
    if (presentResult.error) {
      if (presentResult.error.code === "Canceled") return { success: false, canceled: true };
      return { success: false, error: presentResult.error.message };
    }
    return { success: true };
  }, []);

  return { payWithCard, supported: true };
}
