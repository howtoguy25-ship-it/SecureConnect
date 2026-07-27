import React from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface RowProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  subtitle?: string;
  onPress: () => void;
  iconColor?: string;
}

function Row({ icon, label, subtitle, onPress, iconColor }: RowProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.backgroundDefault,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: (iconColor ?? theme.primary) + "20" }]}>
        <Feather name={icon} size={18} color={iconColor ?? theme.primary} />
      </View>
      <View style={styles.rowText}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>{label}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 1 }}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Feather name="chevron-right" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function SecurityScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
    >
      <View style={[styles.infoCard, { backgroundColor: theme.primary + "14", borderColor: theme.primary + "30" }]}>
        <Feather name="shield" size={22} color={theme.primary} style={{ marginBottom: 8 }} />
        <ThemedText type="body" style={{ fontWeight: "700", color: theme.primary, marginBottom: 4 }}>
          End-to-End Encrypted
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", lineHeight: 18 }}>
          Your messages are encrypted with the Signal Protocol. Only you and the people you message can read them.
        </ThemedText>
      </View>

      <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        ACCOUNT PROTECTION
      </ThemedText>

      <View style={styles.section}>
        <Row
          icon="shield"
          label="Safe Code"
          subtitle="Personal recovery code for your account"
          onPress={() => navigation.navigate("SafeCode")}
        />
      </View>

      <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        KEY BACKUP
      </ThemedText>

      <View style={styles.section}>
        <Row
          icon="key"
          label="Recovery Code"
          subtitle="Back up your encryption keys"
          onPress={() => navigation.navigate("RecoveryCode")}
        />
      </View>

      <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        DEVICES & ACTIVITY
      </ThemedText>

      <View style={styles.section}>
        <Row
          icon="smartphone"
          label="Trusted Devices"
          subtitle="Manage devices linked to your account"
          onPress={() => navigation.navigate("TrustedDevices")}
        />
        <Row
          icon="clock"
          label="Login History"
          subtitle="Recent sign-ins to your account"
          onPress={() => navigation.navigate("LoginHistory")}
        />
      </View>

      <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        ABOUT
      </ThemedText>

      <View style={[styles.aboutCard, { backgroundColor: theme.backgroundDefault }]}>
        <ThemedText type="small" style={{ color: theme.textSecondary, lineHeight: 18 }}>
          Pryvo uses the Signal Protocol (X3DH + Double Ratchet) to provide end-to-end encryption.
          {"\n\n"}
          Your encryption keys are stored locally on your device and never sent to our servers in plaintext.
          {"\n\n"}
          Recovery codes let you restore your keys on a new device. Keep your recovery code in a safe place — it cannot be recovered if lost.
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 4,
  },
  section: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    marginBottom: Spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: 2,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  aboutCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
});
