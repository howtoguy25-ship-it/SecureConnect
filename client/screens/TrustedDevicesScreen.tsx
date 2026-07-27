import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { getDeviceId } from "@/utils/crypto/prekeyManager";

interface Device {
  id: string;
  deviceId: string;
  identityPublicKey: string;
  registeredAt: string;
  lastSeenAt: string;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default function TrustedDevicesScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [currentDeviceId, setCurrentDeviceId] = React.useState<string>("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  React.useEffect(() => {
    getDeviceId().then(setCurrentDeviceId).catch(() => {});
  }, []);

  const { data: devices, isLoading, error } = useQuery<Device[]>({
    queryKey: ["/api/e2ee/devices"],
    queryFn: async () => {
      const token = await getStoredToken();
      const url = new URL("/api/e2ee/devices", getApiUrl()).toString();
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch devices");
      return res.json();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (deviceId: string) => {
      const token = await getStoredToken();
      const url = new URL(`/api/e2ee/devices/${encodeURIComponent(deviceId)}`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to revoke device");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/e2ee/devices"] });
      setRevokingId(null);
    },
    onError: () => {
      Alert.alert("Error", "Failed to revoke device. Please try again.");
      setRevokingId(null);
    },
  });

  function confirmRevoke(device: Device) {
    if (device.deviceId === currentDeviceId) {
      Alert.alert(
        "Current Device",
        "This is your current device. Revoking it will require you to re-register your encryption keys on next login.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Revoke",
            style: "destructive",
            onPress: () => {
              setRevokingId(device.deviceId);
              revokeMutation.mutate(device.deviceId);
            },
          },
        ]
      );
      return;
    }
    Alert.alert(
      "Revoke Device",
      "This device will no longer be able to decrypt new messages.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => {
            setRevokingId(device.deviceId);
            revokeMutation.mutate(device.deviceId);
          },
        },
      ]
    );
  }

  function renderDevice({ item }: { item: Device }) {
    const isCurrent = item.deviceId === currentDeviceId;
    const isRevoking = revokingId === item.deviceId;
    return (
      <View style={[
        styles.deviceCard,
        {
          backgroundColor: theme.backgroundDefault,
          borderColor: isCurrent ? theme.primary + "40" : theme.border,
        },
      ]}>
        <View style={[styles.deviceIcon, { backgroundColor: isCurrent ? theme.primary + "18" : theme.backgroundSecondary }]}>
          <Feather name="smartphone" size={20} color={isCurrent ? theme.primary : theme.textSecondary} />
        </View>
        <View style={styles.deviceInfo}>
          <View style={styles.deviceHeader}>
            <ThemedText type="body" style={{ fontWeight: "700", flex: 1 }}>
              {isCurrent ? "This Device" : `Device ${item.deviceId.slice(0, 8)}`}
            </ThemedText>
            {isCurrent ? (
              <View style={[styles.currentBadge, { backgroundColor: theme.primary + "18" }]}>
                <ThemedText type="small" style={{ color: theme.primary, fontWeight: "700" }}>Current</ThemedText>
              </View>
            ) : null}
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Registered {formatDate(item.registeredAt)}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Last seen {timeAgo(item.lastSeenAt)}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary, fontFamily: "monospace", marginTop: 2 }}>
            {item.identityPublicKey.slice(0, 20)}...
          </ThemedText>
        </View>
        <Pressable
          onPress={() => confirmRevoke(item)}
          disabled={isRevoking}
          style={({ pressed }) => [
            styles.revokeBtn,
            { backgroundColor: theme.error + "14", opacity: pressed || isRevoking ? 0.7 : 1 },
          ]}
        >
          {isRevoking ? (
            <ActivityIndicator size="small" color={theme.error} />
          ) : (
            <Feather name="trash-2" size={16} color={theme.error} />
          )}
        </Pressable>
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
            Failed to load devices.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={devices ?? []}
          keyExtractor={(d) => d.id}
          renderItem={renderDevice}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.lg,
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
          ListHeaderComponent={
            <View style={[styles.infoBar, { backgroundColor: theme.primary + "12", borderColor: theme.primary + "28" }]}>
              <Feather name="info" size={14} color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, marginLeft: 8, lineHeight: 17 }}>
                Devices listed here have your encryption keys registered. Revoke any device you no longer use or recognize.
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="smartphone" size={36} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: 12 }}>
                No devices registered yet.
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  infoBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  currentBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  revokeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
});
