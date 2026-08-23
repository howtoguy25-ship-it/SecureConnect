import { useCallback } from "react";
import { useStripe, initStripe } from "@stripe/stripe-react-native";
import { apiRequest } from "@/lib/query-client";

// Module-scoped so the publishable key is only fetched and initStripe only
// called once per app session, no matter how many screens use this hook.
let cachedKey: string | null = null;
let initialized = false;

async function ensureInitialized(): Promise<boolean> {
  if (initialized) return true;
  try {
    if (!cachedKey) {
      const res = await apiRequest("GET", "/api/payments/stripe/publishable-key");
      const data = await res.json();
      cachedKey = data.publishableKey ?? null;
    }
    if (!cachedKey) return false;
    await initStripe({ publishableKey: cachedKey, merchantIdentifier: "merchant.com.adham.salameh.secureconnectchat" });
    initialized = true;
    return true;
  } catch (e) {
    console.error("[stripe] init failed:", e);
    return false;
  }
}

/**
 * Wraps Stripe's PaymentSheet for a single "pay this PaymentIntent" step —
 * the real card-entry UI, not a stub. Callers create the PaymentIntent
 * server-side first (server holds the secret key), pass the clientSecret
 * here, and this presents Stripe's own native sheet for the user to enter
 * a card and confirm.
 */
export function useStripePayments() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const payWithCard = useCallback(async (clientSecret: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => {
    const ready = await ensureInitialized();
    if (!ready) return { success: false, error: "Stripe is not available right now." };

    const initResult = await initPaymentSheet({
      paymentIntentClientSecret: clientSecret,
      merchantDisplayName: "Pryvo",
    });
    if (initResult.error) return { success: false, error: initResult.error.message };

    const presentResult = await presentPaymentSheet();
    if (presentResult.error) {
      if (presentResult.error.code === "Canceled") return { success: false, canceled: true };
      return { success: false, error: presentResult.error.message };
    }
    return { success: true };
  }, [initPaymentSheet, presentPaymentSheet]);

  return { payWithCard, supported: true };
}
