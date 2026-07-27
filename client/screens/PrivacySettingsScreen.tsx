import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Switch, Pressable, ActivityIndicator, Alert, ScrollView } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { haptics } from "@/lib/haptics";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TIMER_LABELS: Record<number, string> = {
  0: "Off",
  300: "5 minutes",
  28800: "8 hours",
  43200: "12 hours",
  64800: "18 hours",
  86400: "24 hours",
};

type RowProps = {
  icon: string;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  theme: any;
};

// IMPORTANT: defined OUTSIDE the screen so its component identity is stable
// across re-renders. Defining it inside caused React to remount every Switch
// on every parent re-render, which made onValueChange fire stale closures and
// produced the visual bug where toggling one switch flipped the others.
function PrivacyRow({ icon, title, subtitle, value, onValueChange, disabled, theme }: RowProps) {
  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundDefault }]}>
      <View style={[styles.icon, { backgroundColor: theme.primary + "20" }]}>
        <Feather name={icon as any} size={18} color={theme.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="body" style={{ fontWeight: "600" }}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
          {subtitle}
        </ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={!!disabled}
        trackColor={{ false: theme.border, true: theme.primary }}
      />
    </View>
  );
}

export default function PrivacySettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth() as any;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  // Each setting has its OWN state and is mutated independently.
  const [readReceipts, setReadReceipts] = useState<boolean>(user?.readReceiptsEnabled ?? true);
  const [typingInd, setTypingInd] = useState<boolean>(user?.typingIndicatorsEnabled ?? true);
  const [showPreview, setShowPreview] = useState<boolean>(user?.showNotificationPreview ?? true);
  const [defaultTimer, setDefaultTimer] = useState<number>(user?.defaultDisappearingTimer ?? 0);

  // Per-toggle saving flags so a save on one row doesn't disable all others.
  const [savingReadReceipts, setSavingReadReceipts] = useState(false);
  const [savingTyping, setSavingTyping] = useState(false);
  const [savingPreview, setSavingPreview] = useState(false);

  // Track last server values per field so we only sync a local state when its
  // OWN server value actually changed. This avoids the old bug where
  // useEffect([user]) reset all 3 toggles whenever any unrelated user field
  // changed (e.g. after refreshUser following a single-field PATCH).
  const lastServer = useRef({
    readReceipts: user?.readReceiptsEnabled,
    typing: user?.typingIndicatorsEnabled,
    preview: user?.showNotificationPreview,
    timer: user?.defaultDisappearingTimer,
  });

  useEffect(() => {
    if (!user) return;
    const srv = {
      readReceipts: user.readReceiptsEnabled,
      typing: user.typingIndicatorsEnabled,
      preview: user.showNotificationPreview,
      timer: user.defaultDisappearingTimer,
    };
    if (srv.readReceipts !== lastServer.current.readReceipts) {
      setReadReceipts(srv.readReceipts ?? true);
      lastServer.current.readReceipts = srv.readReceipts;
    }
    if (srv.typing !== lastServer.current.typing) {
      setTypingInd(srv.typing ?? true);
      lastServer.current.typing = srv.typing;
    }
    if (srv.preview !== lastServer.current.preview) {
      setShowPreview(srv.preview ?? true);
      lastServer.current.preview = srv.preview;
    }
    if (srv.timer !== lastServer.current.timer) {
      setDefaultTimer(srv.timer ?? 0);
      lastServer.current.timer = srv.timer;
    }
  }, [user]);

  // When returning from the disappearing timer screen, force a refresh so the
  // updated label shows immediately even if AuthContext hasn't re-rendered.
  useFocusEffect(
    React.useCallback(() => {
      if (refreshUser) refreshUser().catch(() => {});
    }, [refreshUser]),
  );

  // Patch a SINGLE field. Each call sends only that one field; the server only
  // updates the columns it receives, so other settings are never touched.
  async function patchField(
    fieldKey: "readReceiptsEnabled" | "typingIndicatorsEnabled" | "showNotificationPreview",
    nextValue: boolean,
    setLocal: (v: boolean) => void,
    setSaving: (v: boolean) => void,
  ) {
    const previous = !nextValue;
    setLocal(nextValue); // optimistic
    setSaving(true);
    try {
      const token = await getStoredToken();
      const res = await fetch(new URL("/api/users/me/privacy", getApiUrl()), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [fieldKey]: nextValue }),
      });
      if (!res.ok) throw new Error("save failed");
      // Update lastServer ref BEFORE refreshUser so the [user] effect doesn't
      // re-set local state to the same value we already have.
      if (fieldKey === "readReceiptsEnabled") lastServer.current.readReceipts = nextValue;
      if (fieldKey === "typingIndicatorsEnabled") lastServer.current.typing = nextValue;
      if (fieldKey === "showNotificationPreview") lastServer.current.preview = nextValue;
      haptics.light();
      if (refreshUser) await refreshUser();
    } catch (e) {
      setLocal(previous); // revert
      Alert.alert("Error", "Couldn't save your privacy setting. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.md,
        gap: Spacing.md,
      }}
    >
      <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
        Choose what others see and how Pryvo handles your activity.
      </ThemedText>

      <PrivacyRow
        theme={theme}
        icon="check-circle"
        title="Read Receipts"
        subtitle="Let others know when you've read their messages. Turning this off hides their read state from you too."
        value={readReceipts}
        disabled={savingReadReceipts}
        onValueChange={(v) =>
          patchField("readReceiptsEnabled", v, setReadReceipts, setSavingReadReceipts)
        }
      />

      <PrivacyRow
        theme={theme}
        icon="edit-3"
        title="Typing Indicators"
        subtitle="Show others when you're typing a message."
        value={typingInd}
        disabled={savingTyping}
        onValueChange={(v) =>
          patchField("typingIndicatorsEnabled", v, setTypingInd, setSavingTyping)
        }
      />

      <PrivacyRow
        theme={theme}
        icon="bell"
        title="Show Message Preview"
        subtitle="Display message text in lock-screen notifications. Off shows only 'New encrypted message'."
        value={showPreview}
        disabled={savingPreview}
        onValueChange={(v) =>
          patchField("showNotificationPreview", v, setShowPreview, setSavingPreview)
        }
      />

      <Pressable
        style={[styles.row, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => navigation.navigate("DisappearingMessages", { scope: "default" })}
      >
        <View style={[styles.icon, { backgroundColor: theme.primary + "20" }]}>
          <Feather name="clock" size={18} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            Default Disappearing Timer
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
            Applied to all new chats you start.
          </ThemedText>
        </View>
        <ThemedText type="body" style={{ color: theme.textSecondary, marginRight: Spacing.xs }}>
          {TIMER_LABELS[defaultTimer] ?? "Off"}
        </ThemedText>
        <Feather name="chevron-right" size={18} color={theme.textSecondary} />
      </Pressable>

      {savingReadReceipts || savingTyping || savingPreview ? (
        <View style={{ alignItems: "center", paddingVertical: Spacing.md }}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
