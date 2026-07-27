import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import { storeAuth } from "@/lib/auth";
import { connectSocket, disconnectSocket } from "@/lib/socket";

interface LoginEvent {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isNewDevice: boolean;
  isCurrentSession: boolean;
  createdAt: string;
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function platformIcon(platform: string | null): React.ComponentProps<typeof Feather>["name"] {
  if (platform === "ios" || platform === "android") return "smartphone";
  if (platform === "web") return "globe";
  return "monitor";
}

export default function LoginHistoryScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const { user, setToken } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: events, isLoading, error, refetch } = useQuery<LoginEvent[]>({
    queryKey: ["/api/auth/login-events"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/login-events");
      return res.json();
    },
  });

  const logoutOthers = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/logout-all-others", {});
      return res.json();
    },
    onSuccess: async (data) => {
      // Server bumps tokenVersion which invalidates other sessions but issues a fresh token
      // for the current session — store it so we don't get logged out ourselves.
      if (data?.token && user) {
        await storeAuth(data.token, user);
        setToken(data.token);
        // The server force-disconnects all sockets in the user's room, including
        // ours. Tear down the stale socket and reconnect with the freshly-issued
        // token so realtime messaging keeps working on this device.
        try {
          disconnectSocket();
          await connectSocket();
        } catch (e) {
          console.warn("Failed to reconnect socket after logout-others:", e);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/login-events"] });
      setLoggingOut(false);
      const msg = "All other devices have been signed out.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Done", msg);
    },
    onError: () => {
      setLoggingOut(false);
      Alert.alert("Error", "Failed to sign out other devices. Please try again.");
    },
  });

  function confirmLogoutOthers() {
    const title = "Sign out other devices?";
    const message = "All other devices logged into your account will be signed out immediately. This device will stay signed in.";
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) {
        setLoggingOut(true);
        logoutOthers.mutate();
      }
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out Others",
        style: "destructive",
        onPress: () => {
          setLoggingOut(true);
          logoutOthers.mutate();
        },
      },
    ]);
  }

  function renderEvent({ item }: { item: LoginEvent }) {
    const accent = item.isNewDevice ? theme.warning : theme.textSecondary;
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: accent + "18" }]}>
          <Feather name={platformIcon(item.platform)} size={18} color={accent} />
        </View>
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <ThemedText type="body" style={{ fontWeight: "700", flex: 1 }} numberOfLines={1}>
              {item.deviceName || "Unknown device"}
            </ThemedText>
            {item.isCurrentSession ? (
              <View style={[styles.badge, { backgroundColor: theme.primary + "18" }]}>
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: "700" }}>This device</ThemedText>
              </View>
            ) : item.isNewDevice ? (
              <View style={[styles.badge, { backgroundColor: theme.warning + "18" }]}>
                <ThemedText type="small" style={{ color: theme.warning, fontWeight: "700" }}>New</ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {formatWhen(item.createdAt)}
          </ThemedText>
          {item.ipAddress ? (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              IP {item.ipAddress}
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={36} color={theme.error} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: 12 }}>
            Failed to load login history.
          </ThemedText>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: theme.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "600" }}>Retry</ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={events ?? []}
          keyExtractor={(e) => e.id}
          renderItem={renderEvent}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.lg,
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
          ListHeaderComponent={
            <View style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.infoBar, { backgroundColor: theme.primary + "10", borderColor: theme.primary + "28" }]}>
                <Feather name="info" size={14} color={theme.primary} />
                <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, marginLeft: 8, lineHeight: 17 }}>
                  Recent sign-ins to your account. If you don't recognize a login, sign out other devices below and change your account protection.
                </ThemedText>
              </View>
              <Pressable
                onPress={confirmLogoutOthers}
                disabled={loggingOut}
                style={({ pressed }) => [
                  styles.dangerBtn,
                  { backgroundColor: theme.error + "12", borderColor: theme.error + "40", opacity: pressed || loggingOut ? 0.7 : 1 },
                ]}
              >
                {loggingOut ? (
                  <ActivityIndicator size="small" color={theme.error} />
                ) : (
                  <>
                    <Feather name="log-out" size={16} color={theme.error} />
                    <ThemedText type="body" style={{ color: theme.error, fontWeight: "700", marginLeft: 8 }}>
                      Sign Out Other Devices
                    </ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="clock" size={36} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: 12 }}>
                No login history yet.
              </ThemedText>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  infoBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.md,
  },
});
