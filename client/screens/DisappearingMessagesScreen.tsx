import React, { useLayoutEffect, useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView, Platform } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight, HeaderButton } from "@react-navigation/elements";
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
type RouteProps = RouteProp<RootStackParamList, "DisappearingMessages">;

const OPTIONS: { label: string; sub: string; value: number }[] = [
  { label: "Off", sub: "Messages stay until you delete them", value: 0 },
  { label: "5 minutes", sub: "Great for quick, private exchanges", value: 300 },
  { label: "8 hours", sub: "Within a working day", value: 28800 },
  { label: "12 hours", sub: "Half a day", value: 43200 },
  { label: "18 hours", sub: "Less than a day", value: 64800 },
  { label: "24 hours", sub: "One full day", value: 86400 },
];

export default function DisappearingMessagesScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const { user, refreshUser } = useAuth() as any;
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const scope = route.params?.scope ?? "default";
  const conversationId = route.params?.conversationId;

  const initial =
    scope === "conversation"
      ? route.params?.currentTimer ?? 0
      : user?.defaultDisappearingTimer ?? 0;

  const [selected, setSelected] = useState<number>(initial);
  const [committed, setCommitted] = useState<number>(initial);
  const [saving, setSaving] = useState(false);

  const dirty = selected !== committed;

  async function handleSave() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const token = await getStoredToken();
      let res: Response;
      if (scope === "conversation" && conversationId) {
        res = await fetch(
          new URL(`/api/conversations/${conversationId}/timer`, getApiUrl()),
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ seconds: selected }),
          },
        );
      } else {
        res = await fetch(new URL("/api/users/me/privacy", getApiUrl()), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ defaultDisappearingTimer: selected }),
        });
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Save failed (${res.status}).`);
      }
      if (scope !== "conversation" && refreshUser) await refreshUser();
      setCommitted(selected);
      haptics.success();
      const opt = OPTIONS.find((o) => o.value === selected);
      const label = opt?.label ?? `${selected}s`;
      const title = "Disappearing messages updated";
      const body = scope === "conversation"
        ? selected === 0
          ? "New messages in this chat will no longer disappear."
          : `New messages in this chat will disappear after ${label}.`
        : selected === 0
          ? "New chats you start will no longer auto-delete messages."
          : `New chats you start will default to ${label}.`;
      // On web, Alert button callbacks can be unreliable — go back immediately
      // and surface confirmation via window.alert.
      if (Platform.OS === "web") {
        try { (globalThis as any).alert?.(`${title}\n\n${body}`); } catch {}
        navigation.goBack();
      } else {
        Alert.alert(
          title,
          body,
          [{ text: "OK", onPress: () => navigation.goBack() }],
          { cancelable: false, onDismiss: () => navigation.goBack() },
        );
      }
    } catch (e: any) {
      Alert.alert(
        "Couldn't save timer",
        e?.message && typeof e.message === "string"
          ? e.message
          : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Header Save button — explicit Save/Done that user requested be restored.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        saving ? (
          <ActivityIndicator color={theme.primary} style={{ marginRight: Spacing.md }} />
        ) : (
          <HeaderButton
            onPress={handleSave}
            disabled={!dirty}
            tintColor={dirty ? theme.primary : theme.textSecondary}
          >
            <ThemedText style={{ color: dirty ? theme.primary : theme.textSecondary, fontWeight: "600" }}>
              Save
            </ThemedText>
          </HeaderButton>
        ),
    });
  }, [navigation, saving, dirty, theme.primary, theme.textSecondary, selected]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: insets.bottom + Spacing.xl + 80,
          paddingHorizontal: Spacing.md,
          gap: Spacing.sm,
        }}
      >
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
          New messages will disappear from this {scope === "conversation" ? "chat" : "device and the recipient's device"} after the chosen time.
          {scope === "default"
            ? " This default applies only to new chats you start; existing chats keep their own timer."
            : ""}
        </ThemedText>
        {OPTIONS.map((opt) => {
          const isSel = selected === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                if (saving) return;
                haptics.light();
                setSelected(opt.value);
              }}
              disabled={saving}
              style={[
                styles.row,
                {
                  backgroundColor: theme.backgroundDefault,
                  borderColor: isSel ? theme.primary : "transparent",
                  opacity: saving ? 0.6 : 1,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {opt.label}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                  {opt.sub}
                </ThemedText>
              </View>
              {isSel ? (
                <Feather name="check" size={20} color={theme.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Sticky bottom Save bar — always visible so user always knows how to commit. */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: theme.backgroundDefault,
            borderTopColor: theme.border,
            paddingBottom: insets.bottom + Spacing.md,
          },
        ]}
      >
        <Pressable
          onPress={handleSave}
          disabled={!dirty || saving}
          style={[
            styles.saveButton,
            {
              backgroundColor: dirty && !saving ? theme.primary : theme.border,
              opacity: dirty && !saving ? 1 : 0.6,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {dirty ? "Save" : "Saved"}
            </ThemedText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  saveButton: {
    height: 50,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});
