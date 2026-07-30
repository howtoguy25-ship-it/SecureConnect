import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  Switch,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getApiUrl, fetchWithTimeout } from "@/lib/api-utils";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "AdminDashboard">;
type ScreenRouteProp = RouteProp<RootStackParamList, "AdminDashboard">;

function showAlert(title: string, message: string) {
  if (Platform.OS === "web") {
    try { window.alert(`${title}\n\n${message}`); } catch {}
    return;
  }
  Alert.alert(title, message);
}

interface AdminUser {
  id: string;
  phoneNumber: string;
  displayName: string;
  createdAt: string;
}

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  actionTaken: string | null;
  createdAt: string;
  reporter: { id: string; phoneNumber: string; displayName: string | null } | null;
  reported: { id: string; phoneNumber: string; displayName: string | null; isSuspended: boolean | null } | null;
}

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

// Every fetch here carries the short-lived token this screen was handed by
// AdminLoginScreen — deliberately NOT the normal app session token, so this
// dashboard works independently of whatever onboarding state the owner's
// main account is in.
export default function AdminDashboardScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { token } = route.params;

  const authHeaders = { Authorization: `Bearer ${token}` };

  const [reviewMode, setReviewMode] = useState(false);
  const [loadingReviewMode, setLoadingReviewMode] = useState(true);

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [showUsers, setShowUsers] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReviewMode = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(new URL("/api/review-mode", getApiUrl()).toString());
      const data = await res.json();
      setReviewMode(!!data?.reviewMode);
    } catch {
      // leave as-is
    } finally {
      setLoadingReviewMode(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        new URL("/api/admin/reports?status=pending&limit=100", getApiUrl()).toString(),
        { headers: authHeaders },
      );
      if (res.ok) {
        setReports(await res.json());
      }
    } catch {
      // leave as-is
    } finally {
      setLoadingReports(false);
    }
  }, [token]);

  useEffect(() => {
    loadReviewMode();
    loadReports();
  }, [loadReviewMode, loadReports]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadReviewMode(), loadReports()]);
    setRefreshing(false);
  };

  const handleToggleReviewMode = async (enabled: boolean) => {
    setReviewMode(enabled);
    try {
      const res = await fetchWithTimeout(new URL("/api/admin/review-mode", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        setReviewMode(!enabled);
        showAlert("Error", "Failed to update review mode");
      }
    } catch {
      setReviewMode(!enabled);
      showAlert("Error", "Failed to update review mode");
    }
  };

  const handleLoadUsers = async () => {
    const next = !showUsers;
    setShowUsers(next);
    if (next && !users) {
      setLoadingUsers(true);
      try {
        const res = await fetchWithTimeout(new URL("/api/admin/users", getApiUrl()).toString(), {
          headers: authHeaders,
        });
        if (res.ok) setUsers(await res.json());
      } catch {
        showAlert("Error", "Failed to load users");
      } finally {
        setLoadingUsers(false);
      }
    }
  };

  const handleReportAction = async (report: AdminReport, action: string) => {
    try {
      const res = await fetchWithTimeout(new URL(`/api/admin/reports/${report.id}/action`, getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setReports((prev) => (prev ? prev.filter((r) => r.id !== report.id) : prev));
      } else {
        showAlert("Error", "Failed to update the report");
      }
    } catch {
      showAlert("Error", "Failed to update the report");
    }
  };

  const handleSignOut = () => {
    navigation.replace("Welcome");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
    >
      <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        REVIEW MODE
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <Pressable
          style={styles.row}
          onPress={() => handleToggleReviewMode(!reviewMode)}
          disabled={loadingReviewMode}
        >
          <View style={styles.rowInfo}>
            <View style={[styles.iconBg, { backgroundColor: reviewMode ? "#34C759" : "#8E8E93" }]}>
              <Feather name="eye" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="body">App Store Review Mode</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {reviewMode ? "Demo login visible to reviewers" : "Demo login hidden from users"}
              </ThemedText>
            </View>
          </View>
          {loadingReviewMode ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <View pointerEvents="none">
              <Switch value={reviewMode} trackColor={{ false: "#767577", true: "#34C759" }} />
            </View>
          )}
        </Pressable>
      </View>

      <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: Spacing.xl }]}>
        REGISTERED USERS
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <Pressable style={styles.row} onPress={handleLoadUsers}>
          <View style={styles.rowInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#FF9500" }]}>
              <Feather name="users" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Registered Users</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {users ? `${users.length} total` : "View all signed up users"}
              </ThemedText>
            </View>
          </View>
          <Feather name={showUsers ? "chevron-up" : "chevron-down"} size={20} color={theme.textSecondary} />
        </Pressable>

        {showUsers ? (
          loadingUsers ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : users && users.length > 0 ? (
            users.map((u) => (
              <View key={u.id} style={[styles.userItem, { borderTopColor: theme.border }]}>
                <View>
                  <ThemedText type="body" style={{ fontWeight: "500" }}>{u.displayName}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>{u.phoneNumber}</ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "N/A"}
                </ThemedText>
              </View>
            ))
          ) : (
            <ThemedText type="small" style={{ color: theme.textSecondary, padding: Spacing.md }}>
              No users found.
            </ThemedText>
          )
        ) : null}
      </View>

      <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: Spacing.xl }]}>
        MODERATION QUEUE — PENDING
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, paddingVertical: Spacing.sm }]}>
        {loadingReports ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : reports && reports.length > 0 ? (
          reports.map((report) => (
            <View key={report.id} style={[styles.reportItem, { borderTopColor: theme.border }]}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>
                {REASON_LABELS[report.reason] || report.reason}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }}>
                Reported: {report.reported?.displayName || report.reported?.phoneNumber || "Unknown"}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                By: {report.reporter?.displayName || report.reporter?.phoneNumber || "Unknown"}
              </ThemedText>
              {report.details ? (
                <ThemedText type="small" style={{ color: theme.text, marginTop: 4 }}>
                  "{report.details}"
                </ThemedText>
              ) : null}
              <View style={styles.actionRow}>
                <Pressable style={[styles.actionBtn, { backgroundColor: theme.backgroundSecondary }]} onPress={() => handleReportAction(report, "dismiss")}>
                  <ThemedText type="small">Dismiss</ThemedText>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: theme.backgroundSecondary }]} onPress={() => handleReportAction(report, "warn")}>
                  <ThemedText type="small">Warn</ThemedText>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: "#FF3B3020" }]} onPress={() => handleReportAction(report, "suspend")}>
                  <ThemedText type="small" style={{ color: "#FF3B30" }}>Suspend</ThemedText>
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <ThemedText type="small" style={{ color: theme.textSecondary, padding: Spacing.md }}>
            No pending reports.
          </ThemedText>
        )}
      </View>

      <Pressable onPress={handleSignOut} style={styles.signOutLink}>
        <ThemedText type="small" style={{ color: theme.textSecondary, textDecorationLine: "underline" }}>
          Exit admin
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  rowInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingBlock: {
    padding: Spacing.lg,
    alignItems: "center",
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  reportItem: {
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
  },
  signOutLink: {
    alignSelf: "center",
    marginTop: Spacing.xl,
    padding: Spacing.sm,
  },
});
