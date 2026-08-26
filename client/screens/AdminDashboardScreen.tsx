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
  TextInput,
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

function showConfirm(title: string, message: string, onConfirm: () => void, confirmLabel = "Confirm") {
  if (Platform.OS === "web") {
    try {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } catch {}
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

interface AdminUser {
  id: string;
  phoneNumber: string;
  displayName: string;
  createdAt: string;
  isSuspended: boolean;
  suspensionReason: string | null;
  isSignedIn: boolean;
  lastSignInAt: string | null;
  lastSignOutAt: string | null;
}

function formatSignInTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const [showSignInStatus, setShowSignInStatus] = useState(false);
  const [signInStatusFilter, setSignInStatusFilter] = useState<"all" | "signedIn" | "signedOut">("all");
  const [expandedSignInRowId, setExpandedSignInRowId] = useState<string | null>(null);

  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportsFilter, setReportsFilter] = useState<"pending" | "all">("pending");

  const [broadcastText, setBroadcastText] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [suspendingUserId, setSuspendingUserId] = useState<string | null>(null);

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

  const loadReports = useCallback(async (filter: "pending" | "all") => {
    setLoadingReports(true);
    try {
      const statusParam = filter === "pending" ? "&status=pending" : "";
      const res = await fetchWithTimeout(
        new URL(`/api/admin/reports?limit=100${statusParam}`, getApiUrl()).toString(),
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
    loadReports(reportsFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportsFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadReviewMode(), loadReports(reportsFilter)]);
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

  // Shares the same /api/admin/users response as "Registered Users" above
  // (it already carries isSignedIn/lastSignInAt/lastSignOutAt) — a second
  // network round trip for the same data would be pure waste.
  const handleLoadSignInStatus = async () => {
    const next = !showSignInStatus;
    setShowSignInStatus(next);
    if (next && !users) {
      setLoadingUsers(true);
      try {
        const res = await fetchWithTimeout(new URL("/api/admin/users", getApiUrl()).toString(), {
          headers: authHeaders,
        });
        if (res.ok) setUsers(await res.json());
      } catch {
        showAlert("Error", "Failed to load sign-in status");
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
        const { report: updated } = await res.json();
        // Pending view: the report no longer belongs there, drop it. All
        // view: keep it visible with its new status/action reflected.
        setReports((prev) => {
          if (!prev) return prev;
          if (reportsFilter === "pending") return prev.filter((r) => r.id !== report.id);
          return prev.map((r) => (r.id === report.id ? { ...r, ...updated } : r));
        });
      } else {
        showAlert("Error", "Failed to update the report");
      }
    } catch {
      showAlert("Error", "Failed to update the report");
    }
  };

  const handleSuspendUser = (targetUser: AdminUser) => {
    const willSuspend = !targetUser.isSuspended;
    showConfirm(
      willSuspend ? "Suspend user?" : "Unsuspend user?",
      willSuspend
        ? `${targetUser.displayName} (${targetUser.phoneNumber}) will be logged out on every device and unable to sign back in until unsuspended.`
        : `${targetUser.displayName} (${targetUser.phoneNumber}) will be able to sign in again.`,
      async () => {
        setSuspendingUserId(targetUser.id);
        try {
          const path = willSuspend ? "suspend" : "unsuspend";
          const res = await fetchWithTimeout(
            new URL(`/api/admin/users/${targetUser.id}/${path}`, getApiUrl()).toString(),
            { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({}) },
          );
          if (res.ok) {
            setUsers((prev) =>
              prev ? prev.map((u) => (u.id === targetUser.id ? { ...u, isSuspended: willSuspend } : u)) : prev,
            );
          } else {
            showAlert("Error", `Failed to ${willSuspend ? "suspend" : "unsuspend"} user`);
          }
        } catch {
          showAlert("Error", `Failed to ${willSuspend ? "suspend" : "unsuspend"} user`);
        } finally {
          setSuspendingUserId(null);
        }
      },
      willSuspend ? "Suspend" : "Unsuspend",
    );
  };

  const handleSendBroadcast = () => {
    const text = broadcastText.trim();
    if (!text) return;
    showConfirm(
      "Send to all users?",
      `This sends "${text}" as a message from Pryvo Team into every user's chat list. It disappears after 10 minutes (or sooner if they delete it).`,
      async () => {
        setSendingBroadcast(true);
        try {
          const res = await fetchWithTimeout(new URL("/api/admin/broadcast", getApiUrl()).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ message: text }),
          });
          if (res.ok) {
            const data = await res.json();
            setBroadcastText("");
            showAlert("Sent", `Delivered to ${data.sent} of ${data.total} users.`);
          } else {
            const data = await res.json().catch(() => ({}));
            showAlert("Error", data?.error || "Failed to send broadcast");
          }
        } catch {
          showAlert("Error", "Failed to send broadcast");
        } finally {
          setSendingBroadcast(false);
        }
      },
      "Send",
    );
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
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ThemedText type="body" style={{ fontWeight: "500" }}>{u.displayName}</ThemedText>
                    {u.isSuspended ? (
                      <View style={styles.suspendedBadge}>
                        <ThemedText type="small" style={{ color: "#FF3B30", fontWeight: "700", fontSize: 10 }}>
                          SUSPENDED
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>{u.phoneNumber}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Joined {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "N/A"}
                  </ThemedText>
                </View>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: u.isSuspended ? theme.backgroundSecondary : "#FF3B3020" }]}
                  onPress={() => handleSuspendUser(u)}
                  disabled={suspendingUserId === u.id}
                >
                  {suspendingUserId === u.id ? (
                    <ActivityIndicator size="small" color={theme.textSecondary} />
                  ) : (
                    <ThemedText type="small" style={{ color: u.isSuspended ? theme.text : "#FF3B30" }}>
                      {u.isSuspended ? "Unsuspend" : "Suspend"}
                    </ThemedText>
                  )}
                </Pressable>
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
        SIGN-IN STATUS
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        <Pressable style={styles.row} onPress={handleLoadSignInStatus}>
          <View style={styles.rowInfo}>
            <View style={[styles.iconBg, { backgroundColor: "#5856D6" }]}>
              <Feather name="log-in" size={16} color="#fff" />
            </View>
            <View>
              <ThemedText type="body">Sign-In Status</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {users ? `${users.filter((u) => u.isSignedIn).length} signed in of ${users.length}` : "Live sign-in/sign-out per user"}
              </ThemedText>
            </View>
          </View>
          <Feather name={showSignInStatus ? "chevron-up" : "chevron-down"} size={20} color={theme.textSecondary} />
        </Pressable>

        {showSignInStatus ? (
          loadingUsers ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : users && users.length > 0 ? (
            <>
              <View style={styles.filterToggle}>
                {(["all", "signedIn", "signedOut"] as const).map((f) => (
                  <Pressable
                    key={f}
                    style={[styles.filterOption, signInStatusFilter === f && { backgroundColor: theme.primary }]}
                    onPress={() => setSignInStatusFilter(f)}
                  >
                    <ThemedText type="small" style={{ color: signInStatusFilter === f ? "#fff" : theme.textSecondary }}>
                      {f === "all" ? "All" : f === "signedIn" ? "Signed In" : "Signed Out"}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              {users
                .filter((u) =>
                  signInStatusFilter === "all"
                    ? true
                    : signInStatusFilter === "signedIn"
                    ? u.isSignedIn
                    : !u.isSignedIn,
                )
                // Signed-in-first, per owner convenience — within each group,
                // most recently active first.
                .sort((a, b) => {
                  if (a.isSignedIn !== b.isSignedIn) return a.isSignedIn ? -1 : 1;
                  const aTime = new Date(a.lastSignInAt ?? 0).getTime();
                  const bTime = new Date(b.lastSignInAt ?? 0).getTime();
                  return bTime - aTime;
                })
                .map((u) => {
                  const expanded = expandedSignInRowId === u.id;
                  return (
                    <Pressable
                      key={u.id}
                      style={[styles.userItem, { borderTopColor: theme.border }]}
                      onPress={() => setExpandedSignInRowId(expanded ? null : u.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <ThemedText type="body" style={{ fontWeight: "500" }}>{u.displayName}</ThemedText>
                          <View
                            style={[
                              styles.signInBadge,
                              { backgroundColor: u.isSignedIn ? "#34C75920" : "#8E8E9320" },
                            ]}
                          >
                            <View
                              style={[
                                styles.signInDot,
                                { backgroundColor: u.isSignedIn ? "#34C759" : "#8E8E93" },
                              ]}
                            />
                            <ThemedText
                              type="small"
                              style={{ color: u.isSignedIn ? "#34C759" : "#8E8E93", fontWeight: "700", fontSize: 10 }}
                            >
                              {u.isSignedIn ? "SIGNED IN" : "SIGNED OUT"}
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>{u.phoneNumber}</ThemedText>
                        {expanded ? (
                          <View style={{ marginTop: 4, gap: 2 }}>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                              Signed in: {formatSignInTimestamp(u.lastSignInAt)}
                            </ThemedText>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                              Signed out: {formatSignInTimestamp(u.lastSignOutAt)}
                            </ThemedText>
                          </View>
                        ) : null}
                      </View>
                      <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={theme.textSecondary} />
                    </Pressable>
                  );
                })}
            </>
          ) : (
            <ThemedText type="small" style={{ color: theme.textSecondary, padding: Spacing.md }}>
              No users found.
            </ThemedText>
          )
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.xl, marginBottom: Spacing.sm }}>
        <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary, marginBottom: 0 }]}>
          MODERATION QUEUE
        </ThemedText>
        <View style={styles.filterToggle}>
          <Pressable
            style={[styles.filterOption, reportsFilter === "pending" && { backgroundColor: theme.primary }]}
            onPress={() => setReportsFilter("pending")}
          >
            <ThemedText type="small" style={{ color: reportsFilter === "pending" ? "#fff" : theme.textSecondary }}>
              Pending
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.filterOption, reportsFilter === "all" && { backgroundColor: theme.primary }]}
            onPress={() => setReportsFilter("all")}
          >
            <ThemedText type="small" style={{ color: reportsFilter === "all" ? "#fff" : theme.textSecondary }}>
              All
            </ThemedText>
          </Pressable>
        </View>
      </View>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, paddingVertical: Spacing.sm }]}>
        {loadingReports ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : reports && reports.length > 0 ? (
          reports.map((report) => (
            <View key={report.id} style={[styles.reportItem, { borderTopColor: theme.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {REASON_LABELS[report.reason] || report.reason}
                </ThemedText>
                {reportsFilter === "all" ? (
                  <ThemedText type="small" style={{ color: theme.textSecondary, textTransform: "uppercase" }}>
                    {report.status}
                  </ThemedText>
                ) : null}
              </View>
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
              {report.actionTaken ? (
                <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4, fontStyle: "italic" }}>
                  {report.actionTaken}
                </ThemedText>
              ) : null}
              {report.status === "pending" ? (
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
              ) : null}
            </View>
          ))
        ) : (
          <ThemedText type="small" style={{ color: theme.textSecondary, padding: Spacing.md }}>
            {reportsFilter === "pending" ? "No pending reports." : "No reports."}
          </ThemedText>
        )}
      </View>

      <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: Spacing.xl }]}>
        BROADCAST MESSAGE
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault, padding: Spacing.md }]}>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
          Sends as "Pryvo Team" into every user's chat list. Not end-to-end encrypted -- clearly labeled as an official
          message, and disappears after 10 minutes (or sooner if the user deletes it).
        </ThemedText>
        <TextInput
          value={broadcastText}
          onChangeText={setBroadcastText}
          placeholder="Write an announcement..."
          placeholderTextColor={theme.textSecondary}
          multiline
          maxLength={1000}
          style={[styles.broadcastInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
        />
        <Pressable
          style={[styles.sendBroadcastBtn, { backgroundColor: theme.primary, opacity: broadcastText.trim() && !sendingBroadcast ? 1 : 0.5 }]}
          onPress={handleSendBroadcast}
          disabled={!broadcastText.trim() || sendingBroadcast}
        >
          {sendingBroadcast ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText type="body" style={{ color: "#fff", fontWeight: "600" }}>
              Send to All Users
            </ThemedText>
          )}
        </Pressable>
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
  suspendedBadge: {
    backgroundColor: "#FF3B3020",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  signInBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  signInDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterToggle: {
    flexDirection: "row",
    gap: 4,
  },
  filterOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  broadcastInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    textAlignVertical: "top",
    marginBottom: Spacing.sm,
  },
  sendBroadcastBtn: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
