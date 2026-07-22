import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { useAuth } from "@/context/AuthContext";
import { submitVerification, watchLatestVerification } from "@/services/verification";
import { watchBusiness } from "@/services/businesses";
import type { Business, VerificationRequest } from "@/types";

type Props = NativeStackScreenProps<RootStackParamList, "BusinessVerification">;

const STATUS_COPY: Record<VerificationRequest["status"], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  unverified: { label: "Not submitted", color: "#6B7280", icon: "help-circle-outline" },
  pending: { label: "Pending review", color: "#FBBF24", icon: "time-outline" },
  verified: { label: "Verified", color: "#34D399", icon: "checkmark-circle" },
  rejected: { label: "Rejected", color: "#F87171", icon: "close-circle" },
};

export function BusinessVerificationScreen({ route, navigation }: Props) {
  const { businessId } = route.params;
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [legalName, setLegalName] = useState("");
  const [abn, setAbn] = useState("");
  const [acn, setAcn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<VerificationRequest | null>(null);

  useEffect(() => watchBusiness(businessId, setBusiness), [businessId]);
  useEffect(() => {
    if (!lastRequestId) return;
    return watchLatestVerification(businessId, lastRequestId, setLiveStatus);
  }, [businessId, lastRequestId]);

  async function handleSubmit() {
    if (!user) return;
    if (!legalName.trim()) {
      Alert.alert("Legal business name required");
      return;
    }
    if (!abn.trim() && !acn.trim()) {
      Alert.alert("ABN or ACN required", "Enter at least one to verify your business.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitVerification({
        businessId,
        submittedBy: user.uid,
        legalBusinessName: legalName.trim(),
        abn: abn.trim() || undefined,
        acn: acn.trim() || undefined,
      });
      setLiveStatus({
        id: "latest",
        businessId,
        submittedBy: user.uid,
        legalBusinessName: legalName.trim(),
        abn: abn.trim() || undefined,
        acn: acn.trim() || undefined,
        status: result.status,
        abrEntityName: result.abrEntityName,
        abrEntityStatus: result.abrEntityStatus,
        rejectionReason: result.rejectionReason,
        submittedAt: Date.now(),
      });
    } catch (err) {
      Alert.alert("Verification failed", err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const status = liveStatus?.status ?? business?.verificationStatus ?? "unverified";
  const statusCopy = STATUS_COPY[status];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={[styles.statusBadge, { borderColor: statusCopy.color }]}>
        <Ionicons name={statusCopy.icon} size={16} color={statusCopy.color} />
        <Text style={[styles.statusText, { color: statusCopy.color }]}>{statusCopy.label}</Text>
      </View>
      {liveStatus?.rejectionReason && <Text style={styles.reason}>{liveStatus.rejectionReason}</Text>}
      {liveStatus?.abrEntityName && (
        <Text style={styles.abrMatch}>Matched register entity: {liveStatus.abrEntityName}</Text>
      )}

      <Text style={styles.label}>Legal business name</Text>
      <TextInput style={styles.input} value={legalName} onChangeText={setLegalName} placeholder="As registered with the ABR/ASIC" placeholderTextColor="#6B7280" />

      <Text style={styles.label}>ABN (11 digits)</Text>
      <TextInput style={styles.input} value={abn} onChangeText={setAbn} keyboardType="number-pad" placeholder="e.g. 51 824 753 556" placeholderTextColor="#6B7280" />

      <Text style={styles.label}>ACN (9 digits, optional if ABN provided)</Text>
      <TextInput style={styles.input} value={acn} onChangeText={setAcn} keyboardType="number-pad" placeholder="e.g. 000 000 019" placeholderTextColor="#6B7280" />

      <Text style={styles.hint}>
        Your ABN is checked against the real Australian Business Register when configured. ACN has no free public
        lookup, so ACN-only submissions go to manual review. Verification is optional -- you can publish your store
        without it, but a verified badge builds customer trust.
      </Text>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Submit for verification</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipButton} onPress={() => navigation.replace("BusinessDashboard", { businessId })}>
        <Text style={styles.skipText}>Skip for now, go to dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  statusText: { fontSize: 13, fontWeight: "600" },
  reason: { color: "#F87171", fontSize: 12, marginBottom: 8 },
  abrMatch: { color: "#34D399", fontSize: 12, marginBottom: 8 },
  label: { color: "#9CA3AF", fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: "#1F2937", color: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  hint: { color: "#6B7280", fontSize: 12, marginTop: 16, lineHeight: 18 },
  submitButton: { backgroundColor: "#4F46E5", borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  submitButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  skipButton: { alignItems: "center", paddingVertical: 16, marginBottom: 24 },
  skipText: { color: "#818CF8", fontSize: 13 },
});
