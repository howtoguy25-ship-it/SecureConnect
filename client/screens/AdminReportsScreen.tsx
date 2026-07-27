import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";

interface AdminReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reportedMessageId: string | null;
  reason: string;
  details: string | null;
  status: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  actionTaken: string | null;
  createdAt: string;
  reporter: { id: string; phoneNumber: string; displayName: string | null } | null;
  reported: { id: string; phoneNumber: string; displayName: string | null; isSuspended: boolean | null } | null;
}

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "reviewed", label: "Reviewed" },
  { key: "actioned", label: "Actioned" },
  { key: "dismissed", label: "Dismissed" },
];

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  sexual_content: "Sexual content",
  threats_or_violence: "Threats / violence",
  csam: "CSAM (child safety)",
  impersonation: "Impersonation",
  scam_or_fraud: "Scam / fraud",
  other: "Other",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminReportsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [refreshing, setRefreshing] = useState(false);

  const { data: reports, isLoading, error, refetch } = useQuery<AdminReport[]>({
    queryKey: ["/api/admin/reports", statusFilter],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/reports?status=${encodeURIComponent(statusFilter)}&limit=200`,
      );
      return res.json();
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (params: { id: string; action: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/admin/reports/${params.id}/action`, {
        action: params.action,
        notes: params.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports"] });
    },
    onError: (err: Error) => {
      Alert.alert("Action failed", err.message || "Could not update report");
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };

  const handleAction = (report: AdminReport) => {
    const reportedName = report.reported?.displayName || report.reported?.phoneNumber || "this user";
    const isSuspended = !!report.reported?.isSuspended;

    const buttons: Array<{ text: string; style?: "cancel" | "destructive"; onPress?: () => void }> = [
      { text: "Cancel", style: "cancel" },
      {
        text: "Dismiss report",
        onPress: () => actionMutation.mutate({ id: report.id, action: "dismiss" }),
      },
      {
        text: "Mark reviewed",
        onPress: () => actionMutation.mutate({ id: report.id, action: "reviewed" }),
      },
      {
        text: "Warn user",
        onPress: () => actionMutation.mutate({ id: report.id, action: "warn" }),
      },
    ];

    if (isSuspended) {
      buttons.push({
        text: "Unsuspend user",
        onPress: () => actionMutation.mutate({ id: report.id, action: "unsuspend" }),
      });
    } else {
      buttons.push({
        text: "Suspend user",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "Suspend user?",
            `This will immediately log ${reportedName} out of every device and block them from signing back in. This action satisfies Apple Guideline 1.2 ejection.`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Suspend",
                style: "destructive",
                onPress: () => actionMutation.mutate({ id: report.id, action: "suspend" }),
              },
            ],
          );
        },
      });
    }

    Alert.alert(
      `Report against ${reportedName}`,
      `Reason: ${REASON_LABELS[report.reason] || report.reason}${
        report.details ? `\n\nDetails: ${report.details}` : ""
      }`,
      buttons,
    );
  };

  const headerCounts = useMemo(() => {
    const items = reports ?? [];
    return { total: items.length };
  }, [reports]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <View
        style={[
          styles.tabs,
          { paddingTop: headerHeight + Spacing.sm, backgroundColor: theme.backgroundDefault, borderBottomColor: theme.border },
        ]}
      >
        {STATUS_TABS.map((t) => {
          const active = t.key === statusFilter;
          return (
            <Pressable
              key={t.key}
              onPress={() => setStatusFilter(t.key)}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? theme.primary : "transparent",
                  borderColor: active ? theme.primary : theme.border,
                },
              ]}
            >
              <ThemedText
                type="small"
                style={{ color: active ? "#fff" : theme.textSecondary, fontWeight: "600" }}
              >
                {t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={theme.textSecondary} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
            Could not load reports
          </ThemedText>
          <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: theme.primary }]}>
            <ThemedText type="small" style={{ color: "#fff", fontWeight: "600" }}>
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : (reports ?? []).length === 0 ? (
        <View style={styles.center}>
          <Feather name="check-circle" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
            No {statusFilter} reports
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            padding: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
          ListHeaderComponent={
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
              {headerCounts.total} report{headerCounts.total === 1 ? "" : "s"}
            </ThemedText>
          }
          renderItem={({ item }) => {
            const reportedName = item.reported?.displayName || item.reported?.phoneNumber || "Unknown";
            const reporterName = item.reporter?.displayName || item.reporter?.phoneNumber || "Unknown";
            const suspended = !!item.reported?.isSuspended;
            return (
              <Pressable
                onPress={() => handleAction(item)}
                style={[styles.card, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.reasonChip, { backgroundColor: "#FF9500" }]}>
                    <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>
                      {REASON_LABELS[item.reason] || item.reason}
                    </ThemedText>
                  </View>
                  {suspended ? (
                    <View style={[styles.reasonChip, { backgroundColor: "#FF3B30" }]}>
                      <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>
                        Suspended
                      </ThemedText>
                    </View>
                  ) : null}
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: "auto" }}>
                    {formatWhen(item.createdAt)}
                  </ThemedText>
                </View>

                <View style={{ marginTop: Spacing.sm }}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>
                    Reported: {reportedName}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                    by {reporterName}
                  </ThemedText>
                </View>

                {item.details ? (
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
                    "{item.details}"
                  </ThemedText>
                ) : null}

                {item.reportedMessageId ? (
                  <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2, fontFamily: "monospace" }}>
                    msg: {item.reportedMessageId.slice(0, 8)}…
                  </ThemedText>
                ) : null}

                {item.actionTaken ? (
                  <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
                    <Feather name="info" size={14} color={theme.textSecondary} />
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 6 }}>
                      {item.actionTaken} · {formatWhen(item.reviewedAt)}
                    </ThemedText>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.lg },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.xs, flexWrap: "wrap" },
  reasonChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
