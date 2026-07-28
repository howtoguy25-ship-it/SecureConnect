import React from "react";
import { View, StyleSheet, Pressable, Linking, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";

const SUPPORT_EMAIL = "adisssal7@hotmail.com";

const FAQ_ITEMS = [
  {
    q: "How do I send an encrypted message?",
    a: "All messages in Pryvo are automatically end-to-end encrypted. Just open a conversation and start typing — encryption happens invisibly in the background.",
  },
  {
    q: "What is the Hidden Locker?",
    a: "The Hidden Locker is a VIP feature that lets you privately store sensitive messages and media behind a PIN. Access it from the Locker tab.",
  },
  {
    q: "How do I get VIP?",
    a: "Tap 'Get VIP' in the Settings screen or anywhere the VIP badge appears. VIP unlocks the Hidden Locker, screenshot protection, and more.",
  },
  {
    q: "Can I delete my account?",
    a: "Yes. Go to Settings, scroll to the bottom, and tap 'Delete Account'. This permanently removes all your data.",
  },
  {
    q: "How do I verify my phone number?",
    a: "During sign-up, enter your phone number and we will send you a one-time code. Enter that code to verify and continue.",
  },
];

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  const isVip = !!user?.isVip;

  const openEmail = () => {
    // VIP subject line is intentionally distinct so priority requests are
    // visually flagged in the inbox and handled first — the actual
    // mechanism behind the "Priority Support" VIP perk.
    const subject = isVip ? "%5BVIP%5D%20Pryvo%20Priority%20Support" : "Pryvo%20Support";
    const body = isVip ? `?subject=${subject}&body=VIP%20Member%20-%20Phone%3A%20${encodeURIComponent(user?.phoneNumber ?? "")}` : `?subject=${subject}`;
    Linking.openURL(`mailto:${SUPPORT_EMAIL}${body}`);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.heroCard, { backgroundColor: theme.backgroundDefault }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.primary + "20" }]}>
          <Feather name="headphones" size={36} color={theme.primary} />
        </View>
        <ThemedText type="h2" style={styles.heroTitle}>Help & Support</ThemedText>
        {isVip ? (
          <View style={[styles.vipPill, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="award" size={14} color={theme.primary} />
            <ThemedText type="small" style={[styles.vipPillText, { color: theme.primary }]}>
              VIP Priority Support
            </ThemedText>
          </View>
        ) : null}
        <ThemedText type="body" style={[styles.heroSub, { color: theme.textSecondary }]}>
          {isVip
            ? "As a VIP member, your requests are flagged and handled first — we'll respond within 4 hours."
            : "We are here to help. Reach out any time and we will respond within 24 hours."}
        </ThemedText>
        <Pressable
          style={[styles.emailBtn, { backgroundColor: theme.primary }]}
          onPress={openEmail}
        >
          <Feather name="mail" size={18} color="#fff" />
          <ThemedText type="body" style={styles.emailBtnText}>
            {isVip ? "Email Priority Support" : "Email Support"}
          </ThemedText>
        </Pressable>
        <ThemedText type="small" style={[styles.emailAddr, { color: theme.textSecondary }]}>
          {SUPPORT_EMAIL}
        </ThemedText>
      </View>

      <ThemedText type="h3" style={styles.faqTitle}>Frequently Asked Questions</ThemedText>

      {FAQ_ITEMS.map((item, index) => (
        <View key={index} style={[styles.faqCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.faqQuestion}>
            <Feather name="help-circle" size={18} color={theme.primary} style={styles.faqIcon} />
            <ThemedText type="body" style={styles.faqQ}>{item.q}</ThemedText>
          </View>
          <ThemedText type="body" style={[styles.faqA, { color: theme.textSecondary }]}>
            {item.a}
          </ThemedText>
        </View>
      ))}

      <View style={[styles.footerCard, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="shield" size={20} color={theme.textSecondary} />
        <ThemedText type="small" style={[styles.footerText, { color: theme.textSecondary }]}>
          Pryvo — Private messaging built for everyone
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  vipPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  vipPillText: {
    fontWeight: "700",
  },
  heroSub: {
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  emailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  emailBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  emailAddr: {
    marginTop: Spacing.xs,
  },
  faqTitle: {
    marginBottom: Spacing.lg,
  },
  faqCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  faqQuestion: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  faqIcon: {
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  faqQ: {
    flex: 1,
    fontWeight: "600",
  },
  faqA: {
    lineHeight: 22,
    paddingLeft: Spacing.lg + 2,
  },
  footerCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  footerText: {
    flex: 1,
    lineHeight: 20,
  },
});
