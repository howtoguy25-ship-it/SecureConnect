import React, { useState } from "react";
import { View, StyleSheet, Pressable, Alert, ActivityIndicator, FlatList, Modal, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { haptics } from "@/lib/haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";

interface VirtualNumberStatus {
  hasVirtualNumber: boolean;
  virtualNumber: {
    phoneNumber: string;
    countryCode: string;
    capabilities: { voice: boolean; sms: boolean; mms: boolean };
    status: string;
  } | null;
  preferredNumberType: "personal" | "app";
  isVip: boolean;
}

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  locality: string;
  region: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
}

export default function VirtualNumberScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user, refreshUser, setNumberMode } = useAuth();
  const queryClient = useQueryClient();

  const [showNumberPicker, setShowNumberPicker] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("US");

  const { data: status, isLoading } = useQuery<VirtualNumberStatus>({
    queryKey: ["/api/virtual-number"],
  });

  const { data: availableNumbers, isLoading: isLoadingNumbers, refetch: refetchNumbers } = useQuery<{ numbers: AvailableNumber[] }>({
    queryKey: [`/api/virtual-number/available?country=${selectedCountry}`],
    enabled: showNumberPicker,
  });

  const provisionMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; countryCode: string }) => {
      return apiRequest("POST", "/api/virtual-number/provision", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/virtual-number"] });
      setShowNumberPicker(false);
      refreshUser();
      // Presenting Alert.alert in the same tick as dismissing the pageSheet
      // Modal races iOS's dismiss animation — the alert can render while the
      // modal's view hierarchy is still tearing down, which is what was
      // showing up as a black screen right after "phone active successfully".
      // Waiting for the sheet's dismiss animation to finish first avoids the
      // collision.
      setTimeout(() => {
        Alert.alert("Success", "Your Pryvo number is now active!");
      }, 400);
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to get your number. Please try again.");
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/virtual-number");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/virtual-number"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      refreshUser();
      Alert.alert("Disposed", "Your Pryvo number has been disposed and its message history cleared.");
    },
    onError: (error: any) => {
      Alert.alert("Error", error.message || "Failed to dispose your number.");
    },
  });

  const preferenceMutation = useMutation({
    mutationFn: async (preferredNumberType: "personal" | "app") => {
      return apiRequest("PUT", "/api/virtual-number/preference", { preferredNumberType });
    },
    onSuccess: (_, preferredNumberType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/virtual-number"] });
      // Auto-switch chat mode based on selected number preference
      if (preferredNumberType === "app") {
        setNumberMode("virtual");
      } else {
        setNumberMode("personal");
      }
    },
  });

  const handleProvision = (number: AvailableNumber) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Get ${number.phoneNumber} as your Pryvo number?`);
      if (confirmed) {
        provisionMutation.mutate({
          phoneNumber: number.phoneNumber,
          countryCode: selectedCountry,
        });
      }
    } else {
      Alert.alert(
        "Confirm Number",
        `Get ${number.phoneNumber} as your Pryvo number?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Get Number",
            onPress: () => provisionMutation.mutate({
              phoneNumber: number.phoneNumber,
              countryCode: selectedCountry,
            }),
          },
        ]
      );
    }
  };

  const handleRelease = () => {
    const message = "This retires the number itself — your contacts and chat history stay, so you can keep chatting in the same conversation once you get a new number. This can't be undone.";
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`Dispose your Pryvo number? ${message}`);
      if (confirmed) {
        releaseMutation.mutate();
      }
    } else {
      Alert.alert(
        "Dispose This Number?",
        message,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Dispose",
            style: "destructive",
            onPress: () => releaseMutation.mutate(),
          },
        ]
      );
    }
  };

  const togglePreference = () => {
    if (!status?.hasVirtualNumber) return;
    const newPref = status.preferredNumberType === "personal" ? "app" : "personal";
    preferenceMutation.mutate(newPref);
  };

  if (isLoading) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: theme.primary + "20" }]}>
          <Feather name="phone" size={32} color={theme.primary} />
        </View>
        <ThemedText type="h2" style={styles.title}>
          Pryvo Number
        </ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          Get a dedicated phone number for fully encrypted calls and messages
        </ThemedText>
      </View>

      {status?.hasVirtualNumber && status.virtualNumber ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              YOUR SECURECONNECT NUMBER
            </ThemedText>
            <Pressable
              onPress={() => {
                haptics.light();
                Alert.alert(
                  status.virtualNumber!.phoneNumber,
                  "What would you like to do?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Copy Number",
                      onPress: async () => {
                        await Clipboard.setStringAsync(status.virtualNumber!.phoneNumber);
                        Alert.alert("Copied!", "Phone number copied to clipboard");
                      },
                    },
                    {
                      text: "Call This Number",
                      onPress: () => {
                        const phoneUrl = `tel:${status.virtualNumber!.phoneNumber}`;
                        Linking.openURL(phoneUrl).catch(() => {
                          Alert.alert("Error", "Unable to open phone app");
                        });
                      },
                    },
                  ]
                );
              }}
              style={({ pressed }) => [
                styles.phoneNumberButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <ThemedText type="h2" style={[styles.phoneNumber, { color: theme.primary }]}>
                {status.virtualNumber.phoneNumber}
              </ThemedText>
              <Feather name="copy" size={18} color={theme.primary} style={{ marginLeft: Spacing.sm }} />
            </Pressable>
            <View style={styles.capabilitiesRow}>
              {status.virtualNumber.capabilities.voice ? (
                <View style={[styles.capability, { backgroundColor: theme.success + "20" }]}>
                  <Feather name="phone-call" size={14} color={theme.success} />
                  <ThemedText type="small" style={{ color: theme.success }}>Voice</ThemedText>
                </View>
              ) : null}
              {status.virtualNumber.capabilities.sms ? (
                <View style={[styles.capability, { backgroundColor: theme.success + "20" }]}>
                  <Feather name="message-circle" size={14} color={theme.success} />
                  <ThemedText type="small" style={{ color: theme.success }}>SMS</ThemedText>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="h3">Number Preference</ThemedText>
            <ThemedText type="small" style={[styles.prefDesc, { color: theme.textSecondary }]}>
              Choose which number to use for calls and messages
            </ThemedText>

            <Pressable
              style={[
                styles.prefOption,
                status.preferredNumberType === "personal" && styles.prefSelected,
                { borderColor: status.preferredNumberType === "personal" ? theme.primary : theme.border },
              ]}
              onPress={() => preferenceMutation.mutate("personal")}
            >
              <Feather
                name={status.preferredNumberType === "personal" ? "check-circle" : "circle"}
                size={20}
                color={status.preferredNumberType === "personal" ? theme.primary : theme.textSecondary}
              />
              <View style={styles.prefInfo}>
                <ThemedText type="body">Personal Number</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {user?.phoneNumber}
                </ThemedText>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.prefOption,
                status.preferredNumberType === "app" && styles.prefSelected,
                { borderColor: status.preferredNumberType === "app" ? theme.primary : theme.border },
              ]}
              onPress={() => preferenceMutation.mutate("app")}
            >
              <Feather
                name={status.preferredNumberType === "app" ? "check-circle" : "circle"}
                size={20}
                color={status.preferredNumberType === "app" ? theme.primary : theme.textSecondary}
              />
              <View style={styles.prefInfo}>
                <ThemedText type="body">Pryvo Number</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {status.virtualNumber.phoneNumber}
                </ThemedText>
              </View>
            </Pressable>
          </View>

          <Pressable
            style={[styles.releaseButton, { borderColor: theme.error }]}
            onPress={handleRelease}
            disabled={releaseMutation.isPending}
          >
            {releaseMutation.isPending ? (
              <ActivityIndicator size="small" color={theme.error} />
            ) : (
              <>
                <Feather name="x-circle" size={18} color={theme.error} />
                <ThemedText type="body" style={{ color: theme.error }}>
                  Dispose This Number
                </ThemedText>
              </>
            )}
          </Pressable>
          <ThemedText type="small" style={[styles.prefDesc, { color: theme.textSecondary, textAlign: "center" }]}>
            Every Pryvo number is disposable. Disposing it retires the number itself — your contacts and chat history stay, so you can keep chatting in the same conversation once you get a new number.
          </ThemedText>
        </>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="h3">Get Your Number</ThemedText>
          <ThemedText type="body" style={[styles.cardText, { color: theme.textSecondary }]}>
            Choose a dedicated phone number that only works within Pryvo. All calls and messages are fully encrypted.
          </ThemedText>
          <Button
            onPress={() => {
              setShowNumberPicker(true);
              refetchNumbers();
            }}
          >
            Browse Available Numbers
          </Button>
        </View>
      )}

      <View style={[styles.encryptionCard, { backgroundColor: theme.success + '15', borderColor: theme.success + '30' }]}>
        <View style={styles.encryptionHeader}>
          <View style={[styles.encryptionBadge, { backgroundColor: theme.success }]}>
            <Feather name="lock" size={16} color="#fff" />
          </View>
          <ThemedText type="body" style={{ fontWeight: '600', color: theme.success }}>
            End-to-End Encrypted
          </ThemedText>
        </View>
        <ThemedText type="small" style={[styles.encryptionText, { color: theme.textSecondary }]}>
          All calls and messages through your Pryvo number are protected with military-grade encryption. Your conversations are private and secure.
        </ThemedText>
        <View style={styles.encryptionFeatures}>
          <View style={styles.encryptionFeature}>
            <Feather name="shield" size={14} color={theme.success} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>Secure calls</ThemedText>
          </View>
          <View style={styles.encryptionFeature}>
            <Feather name="message-circle" size={14} color={theme.success} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>Private messages</ThemedText>
          </View>
          <View style={styles.encryptionFeature}>
            <Feather name="eye-off" size={14} color={theme.success} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>Hidden identity</ThemedText>
          </View>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="info" size={20} color={theme.primary} />
        <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
          Your Pryvo number is completely separate from your personal phone and cannot be traced back to you.
        </ThemedText>
      </View>

      <Modal visible={showNumberPicker} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="h3">Choose Your Number</ThemedText>
            <Pressable onPress={() => setShowNumberPicker(false)}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          {isLoadingNumbers ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.primary} />
              <ThemedText type="body" style={{ marginTop: Spacing.md, color: theme.textSecondary }}>
                Finding available numbers...
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={availableNumbers?.numbers || []}
              keyExtractor={(item) => item.phoneNumber}
              contentContainerStyle={{ padding: Spacing.lg }}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Feather name="phone-off" size={48} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                    No numbers available right now
                  </ThemedText>
                </View>
              }
              renderItem={({ item }) => (
                <View style={[styles.numberItem, { backgroundColor: theme.backgroundDefault }]}>
                  <View style={styles.numberInfo}>
                    <ThemedText type="h3">{item.phoneNumber}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {item.locality ? `${item.locality}, ${item.region}` : item.region || "Available"}
                    </ThemedText>
                  </View>
                  <Pressable
                    style={[styles.getNumberButton, { backgroundColor: theme.primary }]}
                    onPress={() => handleProvision(item)}
                    disabled={provisionMutation.isPending}
                  >
                    {provisionMutation.isPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="plus" size={16} color="#fff" />
                        <ThemedText type="small" style={styles.getNumberButtonText}>Get</ThemedText>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  cardText: {
    marginVertical: Spacing.md,
  },
  vipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  phoneNumber: {
    fontSize: 24,
    fontWeight: "700",
  },
  phoneNumberButton: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.md,
  },
  capabilitiesRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  capability: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  prefDesc: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  prefOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    marginBottom: Spacing.sm,
  },
  prefSelected: {
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  prefInfo: {
    flex: 1,
  },
  releaseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  infoText: {
    flex: 1,
    lineHeight: 18,
  },
  encryptionCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
  },
  encryptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  encryptionBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  encryptionText: {
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  encryptionFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  encryptionFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  numberItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  numberInfo: {
    flex: 1,
  },
  getNumberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  getNumberButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
