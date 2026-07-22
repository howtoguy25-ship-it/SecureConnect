import React, { useEffect, useState } from "react";
import { Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import {
  watchTeam,
  inviteTeamMemberByEmail,
  changeRole,
  setMemberStatus,
  removeTeamMember,
  blockCustomer,
} from "@/services/membership";
import type { Membership, MembershipRole } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "TeamManagement">;

// "owner" is deliberately excluded -- it's fixed to whoever created the business (businesses/
// {id}.ownerId) and isn't reassignable through team management. Inviting/changing someone to
// role "owner" here would give them owner-level permissions without them actually being the
// recorded owner, which is confusing and not a real ownership transfer.
const ASSIGNABLE_ROLES: Array<Exclude<MembershipRole, "owner">> = ["manager", "staff"];

export function TeamManagementScreen({ route }: Props) {
  const { businessId } = route.params;
  const { user } = useAuth();
  const [team, setTeam] = useState<Membership[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>("staff");
  const [inviting, setInviting] = useState(false);
  const [blockUid, setBlockUid] = useState("");

  useEffect(() => watchTeam(businessId, setTeam), [businessId]);

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      Alert.alert("Email required");
      return;
    }
    setInviting(true);
    try {
      const result = await inviteTeamMemberByEmail(businessId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      Alert.alert("Added to team", `${result.displayName} is now a ${result.role}.`);
    } catch (err) {
      Alert.alert("Couldn't add team member", err instanceof Error ? err.message : String(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleBlock() {
    if (!user || !blockUid.trim()) return;
    try {
      await blockCustomer(businessId, blockUid.trim(), user.uid);
      setBlockUid("");
      Alert.alert("Blocked", "That user can no longer view or follow this business.");
    } catch (err) {
      Alert.alert("Couldn't block user", err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.sectionTitle}>Team</Text>
      {team.map((member) => (
        <View key={member.uid} style={styles.memberRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{member.displayName}</Text>
            <Text style={styles.memberMeta}>
              {member.role} · {member.status}
            </Text>
          </View>
          {member.uid !== user?.uid && (
            <View style={styles.actions}>
              {ASSIGNABLE_ROLES.filter((r) => r !== member.role).map((r) => (
                <TouchableOpacity key={r} style={styles.actionChip} onPress={() => changeRole(businessId, member.uid, r)}>
                  <Text style={styles.actionChipText}>Make {r}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.actionChip}
                onPress={() => setMemberStatus(businessId, member.uid, member.status === "muted" ? "active" : "muted")}
              >
                <Text style={styles.actionChipText}>{member.status === "muted" ? "Unmute" : "Mute"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionChip, styles.dangerChip]}
                onPress={() =>
                  Alert.alert("Remove from team?", member.displayName, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => removeTeamMember(businessId, member.uid) },
                  ])
                }
              >
                <Text style={[styles.actionChipText, styles.dangerChipText]}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      <Text style={styles.sectionTitle}>Add team member</Text>
      <Text style={styles.hint}>
        They need a Stockly account already (any email/password sign-up). Pick their starting role -- they get
        that role's stock/announcement/team permissions immediately.
      </Text>
      <TextInput
        style={styles.input}
        value={inviteEmail}
        onChangeText={setInviteEmail}
        placeholder="Their account email"
        placeholderTextColor="#6B7280"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View style={styles.typeRow}>
        {ASSIGNABLE_ROLES.map((r) => (
          <TouchableOpacity key={r} style={[styles.actionChip, inviteRole === r && styles.actionChipActive]} onPress={() => setInviteRole(r)}>
            <Text style={[styles.actionChipText, inviteRole === r && styles.actionChipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={handleInvite} disabled={inviting}>
        <Text style={styles.primaryButtonText}>{inviting ? "Adding..." : "Add to team"}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Block a customer</Text>
      <Text style={styles.hint}>Blocked users can no longer view your page or follow this business.</Text>
      <TextInput style={styles.input} value={blockUid} onChangeText={setBlockUid} placeholder="Their account UID" placeholderTextColor="#6B7280" />
      <TouchableOpacity style={[styles.primaryButton, styles.dangerButton]} onPress={handleBlock}>
        <Text style={styles.primaryButtonText}>Block user</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  sectionTitle: { color: "#9CA3AF", fontSize: 12, textTransform: "uppercase", marginTop: 20, marginBottom: 10 },
  hint: { color: "#6B7280", fontSize: 12, marginBottom: 10 },
  memberRow: { backgroundColor: "#1F2937", borderRadius: 12, padding: 12, marginBottom: 8 },
  memberName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  memberMeta: { color: "#9CA3AF", fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  actionChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: "#111827" },
  actionChipActive: { backgroundColor: "#4F46E5" },
  actionChipText: { color: "#9CA3AF", fontSize: 11, textTransform: "capitalize" },
  actionChipTextActive: { color: "#fff" },
  dangerChip: { backgroundColor: "#3F1D1D" },
  dangerChipText: { color: "#F87171" },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: { backgroundColor: "#1F2937", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  primaryButton: { backgroundColor: "#4F46E5", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  dangerButton: { backgroundColor: "#B91C1C" },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
