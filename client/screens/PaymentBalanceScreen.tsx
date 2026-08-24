import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, useNavigation, RouteProp, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type RouteProps = RouteProp<RootStackParamList, "PaymentBalance">;

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    try { window.alert(`${title}\n\n${message}`); } catch {}
    return;
  }
  Alert.alert(title, message);
}

// Minor-unit denominator per currency, mirrored from server/routes.ts
// PAYMENT_CURRENCY_DECIMALS — must stay in sync.
const CURRENCY_DECIMALS: Record<string, number> = { AUD: 2, USD: 2, GBP: 2, EUR: 2, NZD: 2, CAD: 2, BTC: 8 };
const CURRENCIES = Object.keys(CURRENCY_DECIMALS);
const METHODS: Array<{ id: string; label: string }> = [
  { id: "paypal", label: "PayPal" },
  { id: "payid", label: "PayID" },
  { id: "btc", label: "Bitcoin" },
  { id: "other", label: "Other" },
];

function formatMinorUnits(minorUnits: number, currency: string): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const value = minorUnits / Math.pow(10, decimals);
  const formatted = value.toFixed(currency === "BTC" ? 8 : 2);
  return currency === "BTC" ? `${formatted} BTC` : `${currency} ${formatted}`;
}

interface Totals { currency: string; sentMinorUnits: number; receivedMinorUnits: number; netMinorUnits: number; }
interface ByContact extends Totals { counterpartyId: string; counterpartyName: string | null; }
interface Transaction {
  id: string;
  counterpartyId: string;
  direction: "sent" | "received";
  method: string;
  amountMinorUnits: number;
  currency: string;
  note: string | null;
  createdAt: string;
}

export default function PaymentBalanceScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "PaymentBalance">>();
  const counterpartyId = route.params?.counterpartyId;
  const counterpartyName = route.params?.counterpartyName ?? "this contact";

  const [totals, setTotals] = useState<Totals[]>([]);
  const [byContact, setByContact] = useState<ByContact[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [direction, setDirection] = useState<"sent" | "received">("sent");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("AUD");
  const [method, setMethod] = useState("paypal");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const balanceRes = await apiRequest("GET", "/api/payments/balance");
      const balanceData = await balanceRes.json();
      setTotals(balanceData.totals ?? []);
      setByContact(balanceData.byContact ?? []);

      if (counterpartyId) {
        const txRes = await apiRequest("GET", `/api/payments/transactions?counterpartyId=${encodeURIComponent(counterpartyId)}`);
        const txData = await txRes.json();
        setTransactions(Array.isArray(txData) ? txData : []);
      }
    } catch (error) {
      console.error("[PaymentBalance] load failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [counterpartyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLog = async () => {
    if (!counterpartyId) return;
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      showAlert("Invalid amount", "Enter an amount greater than zero.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/payments/transactions", {
        counterpartyId,
        direction,
        method,
        amount: amountNum,
        currency,
        note: note.trim() || undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't log this payment.");
      setAmount("");
      setNote("");
      await load();
      showAlert("Logged", `Recorded ${direction === "sent" ? "a payment to" : "a payment from"} ${counterpartyName}.`);
    } catch (error: any) {
      showAlert("Error", error?.message || "Couldn't log this payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactTotals = counterpartyId ? byContact.filter((c) => c.counterpartyId === counterpartyId) : [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={[styles.infoCard, { backgroundColor: theme.primary + "10", borderColor: theme.primary + "30" }]}>
        <Feather name="shield" size={18} color={theme.primary} style={{ marginBottom: 6 }} />
        <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 18 }}>
          This is a running total of payments you've logged, not money Pryvo holds. Every transfer still happens in PayPal, your banking app, or your wallet — this just keeps score.
        </ThemedText>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: Spacing.xl }} />
      ) : (
        <>
          {counterpartyId ? (
            <>
              <ThemedText type="h4" style={{ marginBottom: Spacing.sm }}>Balance with {counterpartyName}</ThemedText>
              {contactTotals.length === 0 ? (
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.lg }}>
                  No payments logged yet.
                </ThemedText>
              ) : (
                contactTotals.map((c) => (
                  <View key={c.currency} style={[styles.balanceRow, { backgroundColor: theme.backgroundDefault }]}>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>{c.currency}</ThemedText>
                    <ThemedText
                      type="body"
                      style={{ fontWeight: "700", color: c.netMinorUnits >= 0 ? "#34C759" : "#FF3B30" }}
                    >
                      {c.netMinorUnits >= 0 ? "+" : ""}{formatMinorUnits(c.netMinorUnits, c.currency)}
                    </ThemedText>
                  </View>
                ))
              )}

              <ThemedText type="h4" style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}>Log a payment</ThemedText>
              <View style={styles.segmentRow}>
                {(["sent", "received"] as const).map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setDirection(d)}
                    style={[styles.segment, { backgroundColor: direction === d ? theme.primary : theme.backgroundDefault }]}
                  >
                    <ThemedText type="small" style={{ color: direction === d ? "#fff" : theme.text, fontWeight: "600" }}>
                      {d === "sent" ? `I sent ${counterpartyName}` : `I received from ${counterpartyName}`}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>

              <View style={styles.row}>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  style={[styles.amountInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
                />
                <View style={styles.currencyPicker}>
                  {CURRENCIES.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCurrency(c)}
                      style={[styles.currencyChip, { backgroundColor: currency === c ? theme.primary : theme.backgroundDefault }]}
                    >
                      <ThemedText type="small" style={{ color: currency === c ? "#fff" : theme.text }}>{c}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.segmentRow}>
                {METHODS.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => setMethod(m.id)}
                    style={[styles.segment, { backgroundColor: method === m.id ? theme.primary : theme.backgroundDefault }]}
                  >
                    <ThemedText type="small" style={{ color: method === m.id ? "#fff" : theme.text }}>{m.label}</ThemedText>
                  </Pressable>
                ))}
              </View>

              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Note (optional)"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border, marginTop: Spacing.sm }]}
              />

              <Pressable
                onPress={handleLog}
                disabled={isSubmitting}
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.primary, opacity: pressed || isSubmitting ? 0.7 : 1 }]}
              >
                {isSubmitting ? <ActivityIndicator color="#fff" /> : <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>Log Payment</ThemedText>}
              </Pressable>

              {transactions.length > 0 ? (
                <>
                  <ThemedText type="h4" style={{ marginTop: Spacing.xl, marginBottom: Spacing.sm }}>History</ThemedText>
                  {transactions.map((tx) => (
                    <View key={tx.id} style={[styles.txRow, { backgroundColor: theme.backgroundDefault }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <ThemedText type="body">
                          {tx.direction === "sent" ? `You sent ${counterpartyName}` : `${counterpartyName} sent you`}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                          {new Date(tx.createdAt).toLocaleDateString()} · {METHODS.find((m) => m.id === tx.method)?.label ?? tx.method}
                          {tx.note ? ` · ${tx.note}` : ""}
                        </ThemedText>
                      </View>
                      <ThemedText type="body" style={{ fontWeight: "700", color: tx.direction === "received" ? "#34C759" : theme.text }}>
                        {formatMinorUnits(tx.amountMinorUnits, tx.currency)}
                      </ThemedText>
                    </View>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              <ThemedText type="h4" style={{ marginBottom: Spacing.sm }}>Your totals</ThemedText>
              {totals.length === 0 ? (
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.lg }}>
                  Nothing logged yet. Open a chat, tap Payment, then "Log a Payment" to start tracking.
                </ThemedText>
              ) : (
                totals.map((t) => (
                  <View key={t.currency} style={[styles.balanceRow, { backgroundColor: theme.backgroundDefault }]}>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>{t.currency}</ThemedText>
                    <ThemedText
                      type="body"
                      style={{ fontWeight: "700", color: t.netMinorUnits >= 0 ? "#34C759" : "#FF3B30" }}
                    >
                      {t.netMinorUnits >= 0 ? "+" : ""}{formatMinorUnits(t.netMinorUnits, t.currency)}
                    </ThemedText>
                  </View>
                ))
              )}

              {byContact.length > 0 ? (
                <>
                  <ThemedText type="h4" style={{ marginTop: Spacing.xl, marginBottom: Spacing.sm }}>By contact</ThemedText>
                  {byContact.map((c) => (
                    <Pressable
                      key={`${c.counterpartyId}-${c.currency}`}
                      onPress={() => navigation.push("PaymentBalance", { counterpartyId: c.counterpartyId, counterpartyName: c.counterpartyName ?? "this contact" })}
                      style={[styles.balanceRow, { backgroundColor: theme.backgroundDefault }]}
                    >
                      <ThemedText type="body" numberOfLines={1} style={{ flex: 1 }}>{c.counterpartyName ?? "Unknown"}</ThemedText>
                      <ThemedText
                        type="body"
                        style={{ fontWeight: "700", color: c.netMinorUnits >= 0 ? "#34C759" : "#FF3B30" }}
                      >
                        {c.netMinorUnits >= 0 ? "+" : ""}{formatMinorUnits(c.netMinorUnits, c.currency)}
                      </ThemedText>
                      <Feather name="chevron-right" size={18} color={theme.textSecondary} />
                    </Pressable>
                  ))}
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  segment: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  amountInput: {
    flex: 1,
    minWidth: 100,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  currencyPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  currencyChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  input: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
});
