// @stripe/stripe-react-native has no web build (native module only) — the
// web bundle resolves to this stub instead (Metro's .web.ts platform-file
// resolution), so real-money payments are native-only for now.
export function useStripePayments() {
  const payWithCard = async (_clientSecret: string): Promise<{ success: boolean; error?: string; canceled?: boolean }> => {
    return { success: false, error: "Card payments aren't available on web yet — use the Pryvo mobile app." };
  };
  return { payWithCard, supported: false };
}
