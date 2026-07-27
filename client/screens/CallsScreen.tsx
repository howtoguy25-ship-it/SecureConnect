import React, { useState, useCallback, useEffect, memo } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, Modal, TextInput, Linking, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { CallActionsSheet } from "@/components/CallActionsSheet";
import { AnimatedPressable } from "@/components/AnimatedPressable";
import { CallItemSkeleton } from "@/components/Skeleton";

interface Country {
  name: string;
  code: string;
  dial: string;
}

interface GeoCountry {
  isoCode: string;
  name: string;
  dialCode: string;
}

interface GeoPermissionsResponse {
  twilioConfigured: boolean;
  countriesConfigured: boolean;
  countries: GeoCountry[];
}

const DEFAULT_COUNTRIES: Country[] = [
  { name: "United States", code: "US", dial: "+1" },
  { name: "Canada", code: "CA", dial: "+1" },
];

const getFlagEmoji = (countryCode: string) => {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  type: "audio" | "video";
  status: string;
  duration: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  callerName?: string;
  receiverName?: string;
  callerAvatarIndex?: number;
  receiverAvatarIndex?: number;
}

export default function CallsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [showDialer, setShowDialer] = useState(false);
  const [dialNumber, setDialNumber] = useState("");
  const [countries, setCountries] = useState<Country[]>(DEFAULT_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [showCallOptions, setShowCallOptions] = useState(false);
  const [selectedCallUser, setSelectedCallUser] = useState<{ id: string; name: string; phoneNumber?: string } | null>(null);

  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [showCallDetail, setShowCallDetail] = useState(false);
  
  const { data: geoData } = useQuery<GeoPermissionsResponse>({
    queryKey: ['/api/auth/geo-permissions'],
    staleTime: 6 * 60 * 60 * 1000,
  });

  useEffect(() => {
    if (geoData?.countries && geoData.countries.length > 0) {
      const mappedCountries: Country[] = geoData.countries.map((c) => ({
        name: c.name,
        code: c.isoCode,
        dial: c.dialCode,
      }));
      setCountries(mappedCountries);
      
      const currentCodeExists = mappedCountries.some(c => c.code === selectedCountry.code);
      if (!currentCodeExists && mappedCountries.length > 0) {
        setSelectedCountry(mappedCountries[0]);
      }
    }
  }, [geoData]);

  const filteredCountries = countries.filter(
    (country) =>
      country.name.toLowerCase().includes(countrySearchQuery.toLowerCase()) ||
      country.dial.includes(countrySearchQuery) ||
      country.code.toLowerCase().includes(countrySearchQuery.toLowerCase())
  );

  const fetchCalls = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/calls', baseUrl), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setCalls(data);
      }
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchCalls();
    }, [])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchCalls();
  };

  const handleDialNumber = async () => {
    if (dialNumber.length < 6) return;
    
    const fullNumber = `${selectedCountry.dial}${dialNumber}`;
    const phoneUrl = `tel:${fullNumber}`;
    
    try {
      const canOpen = await Linking.canOpenURL(phoneUrl);
      if (canOpen) {
        await Linking.openURL(phoneUrl);
        setShowDialer(false);
        setDialNumber("");
      } else {
        Alert.alert(
          "Cannot Make Call",
          "Phone calls are not available on this device.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("Error opening dialer:", error);
      Alert.alert("Error", "Could not open the phone dialer.");
    }
  };

  const handleDialInput = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    setDialNumber(cleaned);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDurationLong = (seconds: number | null) => {
    if (!seconds) return "No duration";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts: string[] = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    return parts.join(" ");
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const dayMs = 86400000;
    
    if (diff < dayMs) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < dayMs * 2) {
      return "Yesterday";
    }
    if (diff < dayMs * 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatFullDateTime = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }) + " at " + date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Completed";
      case "missed": return "Missed";
      case "declined": return "Declined";
      case "pending": return "Pending";
      case "active": return "In Progress";
      case "no-answer": return "No Answer";
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return theme.success;
      case "missed":
      case "declined":
      case "no-answer": return theme.error;
      case "active": return theme.primary;
      default: return theme.textSecondary;
    }
  };

  const isMissedCall = (status: string) =>
    status === "missed" || status === "declined" || status === "no-answer";

  const getCallIcon = (call: Call) => {
    const missed = isMissedCall(call.status);
    const isOutgoing = call.callerId === user?.id;
    
    if (call.type === "video") {
      return { name: "video" as const, color: missed ? theme.error : theme.success };
    }
    return {
      name: isOutgoing ? "phone-outgoing" as const : "phone-incoming" as const,
      color: missed ? theme.error : theme.success,
    };
  };

  const handleDeleteCall = async (callId: string) => {
    const doDelete = async () => {
      try {
        const token = await getStoredToken();
        const baseUrl = getApiUrl();
        const res = await fetch(new URL(`/api/calls/${callId}`, baseUrl), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setCalls((prev) => prev.filter((c) => c.id !== callId));
          setShowCallDetail(false);
          setSelectedCall(null);
        } else {
          throw new Error("Failed");
        }
      } catch {
        if (Platform.OS === "web") {
          window.alert("Failed to delete call record.");
        } else {
          Alert.alert("Error", "Failed to delete call record.");
        }
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this call record?")) {
        await doDelete();
      }
    } else {
      Alert.alert("Delete Call", "Delete this call record?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleClearAllCalls = async () => {
    const doClear = async () => {
      try {
        const token = await getStoredToken();
        const baseUrl = getApiUrl();
        const res = await fetch(new URL("/api/calls", baseUrl), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setCalls([]);
        } else {
          throw new Error("Failed");
        }
      } catch {
        if (Platform.OS === "web") {
          window.alert("Failed to clear call history.");
        } else {
          Alert.alert("Error", "Failed to clear call history.");
        }
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Clear all call history? This cannot be undone.")) {
        await doClear();
      }
    } else {
      Alert.alert("Clear Call History", "Clear all call history? This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: doClear },
      ]);
    }
  };

  const renderCall = useCallback(({ item }: { item: Call }) => {
    const isOutgoing = item.callerId === user?.id;
    const otherUserName = isOutgoing ? (item.receiverName || "User") : (item.callerName || "User");
    const avatarIndex = isOutgoing ? (item.receiverAvatarIndex || 0) : (item.callerAvatarIndex || 0);
    const callIcon = getCallIcon(item);
    const missed = isMissedCall(item.status);

    return (
      <AnimatedPressable
        style={[styles.callItem, { borderBottomColor: theme.border }]}
        scaleValue={0.98}
        onPress={() => {
          setSelectedCall(item);
          setShowCallDetail(true);
        }}
      >
        <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[avatarIndex] }]}>
          <Feather name="user" size={20} color="#fff" />
        </View>
        
        <View style={styles.callContent}>
          <ThemedText
            type="body"
            style={[styles.name, { color: missed ? theme.error : theme.text }]}
          >
            {otherUserName}
          </ThemedText>
          <View style={styles.callDetails}>
            <Feather name={callIcon.name} size={14} color={callIcon.color} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.type === "video" ? "Video" : "Audio"} {isOutgoing ? "Outgoing" : "Incoming"}
              {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
            </ThemedText>
          </View>
        </View>
        
        <View style={styles.callMeta}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {formatTime(item.createdAt)}
          </ThemedText>
          <AnimatedPressable
            style={styles.callButton}
            scaleValue={0.85}
            hapticType="light"
            onPress={async () => {
              const otherId = isOutgoing ? item.receiverId : item.callerId;
              if (item.type === "video") {
                navigation.navigate("VideoCall", {
                  callId: "",
                  receiverId: otherId,
                  receiverName: otherUserName,
                });
              } else {
                try {
                  const token = await getStoredToken();
                  const baseUrl = getApiUrl();
                  const response = await fetch(new URL(`/api/users/${otherId}/contact-info`, baseUrl), {
                    headers: { 'Authorization': `Bearer ${token}` },
                  });
                  let phoneNumber: string | undefined;
                  if (response.ok) {
                    const data = await response.json();
                    phoneNumber = data.preferredNumberType === 'app' && data.virtualNumber
                      ? data.virtualNumber
                      : data.phoneNumber;
                  }
                  setSelectedCallUser({ id: otherId, name: otherUserName, phoneNumber });
                  setShowCallOptions(true);
                } catch (error) {
                  setSelectedCallUser({ id: otherId, name: otherUserName });
                  setShowCallOptions(true);
                }
              }
            }}
          >
            <Feather
              name={item.type === "video" ? "video" : "phone"}
              size={20}
              color={theme.primary}
            />
          </AnimatedPressable>
        </View>
      </AnimatedPressable>
    );
  }, [user?.id, theme, navigation]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Calls",
      headerRight: calls.length > 0 ? () => (
        <Pressable onPress={handleClearAllCalls} hitSlop={12}>
          <ThemedText type="small" style={{ color: theme.error }}>Clear All</ThemedText>
        </Pressable>
      ) : undefined,
    });
  }, [navigation, calls.length, theme.error]);

  const renderCountryItem = ({ item }: { item: Country }) => (
    <Pressable
      style={({ pressed }) => [
        styles.countryItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
      onPress={() => {
        setSelectedCountry(item);
        setShowCountryPicker(false);
        setCountrySearchQuery("");
      }}
    >
      <ThemedText style={styles.countryFlag}>{getFlagEmoji(item.code)}</ThemedText>
      <ThemedText type="body" style={styles.countryName}>{item.name}</ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary }}>{item.dial}</ThemedText>
    </Pressable>
  );

  const isValidPhone = dialNumber.length >= 6;

  const renderCallDetailModal = () => {
    if (!selectedCall) return null;
    const isOutgoing = selectedCall.callerId === user?.id;
    const otherUserName = isOutgoing
      ? (selectedCall.receiverName || "User")
      : (selectedCall.callerName || "User");
    const avatarIndex = isOutgoing
      ? (selectedCall.receiverAvatarIndex || 0)
      : (selectedCall.callerAvatarIndex || 0);
    const missed = isMissedCall(selectedCall.status);

    const detailRows: { label: string; value: string; icon: keyof typeof Feather.glyphMap; color?: string }[] = [
      {
        label: "Status",
        value: getStatusLabel(selectedCall.status),
        icon: missed ? "x-circle" : "check-circle",
        color: getStatusColor(selectedCall.status),
      },
      {
        label: "Type",
        value: selectedCall.type === "video" ? "Video Call" : "Audio Call",
        icon: selectedCall.type === "video" ? "video" : "phone",
      },
      {
        label: "Direction",
        value: isOutgoing ? "Outgoing" : "Incoming",
        icon: isOutgoing ? "phone-outgoing" : "phone-incoming",
      },
      {
        label: "Date & Time",
        value: formatFullDateTime(selectedCall.createdAt),
        icon: "calendar",
      },
      {
        label: "Duration",
        value: selectedCall.duration ? formatDurationLong(selectedCall.duration) : (missed ? "N/A" : "0s"),
        icon: "clock",
      },
    ];

    if (selectedCall.startedAt) {
      detailRows.push({
        label: "Connected At",
        value: formatFullDateTime(selectedCall.startedAt),
        icon: "play-circle",
      });
    }

    if (selectedCall.endedAt) {
      detailRows.push({
        label: "Ended At",
        value: formatFullDateTime(selectedCall.endedAt),
        icon: "stop-circle",
      });
    }

    return (
      <Modal
        visible={showCallDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowCallDetail(false); setSelectedCall(null); }}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>Call Details</ThemedText>
            <Pressable onPress={() => { setShowCallDetail(false); setSelectedCall(null); }} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.detailContent}>
            <View style={styles.detailUserSection}>
              <View style={[styles.detailAvatar, { backgroundColor: AVATAR_COLORS[avatarIndex] }]}>
                <Feather name="user" size={32} color="#fff" />
              </View>
              <ThemedText type="h3" style={{ marginTop: Spacing.md }}>
                {otherUserName}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                {isOutgoing ? "You called" : "Called you"}
              </ThemedText>
            </View>

            <View style={[styles.detailCard, { backgroundColor: theme.backgroundDefault }]}>
              {detailRows.map((row, i) => (
                <View key={row.label}>
                  {i > 0 ? <View style={[styles.detailSeparator, { backgroundColor: theme.border }]} /> : null}
                  <View style={styles.detailRow}>
                    <View style={styles.detailRowLeft}>
                      <Feather name={row.icon} size={18} color={row.color || theme.textSecondary} />
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>{row.label}</ThemedText>
                    </View>
                    <ThemedText
                      type="body"
                      style={[styles.detailValue, row.color ? { color: row.color } : undefined]}
                      numberOfLines={2}
                    >
                      {row.value}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.detailActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.detailActionButton,
                  { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => {
                  setShowCallDetail(false);
                  setSelectedCall(null);
                  const otherId = isOutgoing ? selectedCall.receiverId : selectedCall.callerId;
                  if (selectedCall.type === "video") {
                    navigation.navigate("VideoCall", { callId: "", receiverId: otherId, receiverName: otherUserName });
                  } else {
                    navigation.navigate("AudioCall", { callId: "", receiverId: otherId, receiverName: otherUserName });
                  }
                }}
              >
                <Feather name={selectedCall.type === "video" ? "video" : "phone"} size={20} color="#fff" />
                <ThemedText type="body" style={{ color: "#fff", fontWeight: "600" }}>
                  Call Again
                </ThemedText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.detailActionButton,
                  { backgroundColor: "transparent", borderWidth: 1, borderColor: theme.error, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => handleDeleteCall(selectedCall.id)}
              >
                <Feather name="trash-2" size={20} color={theme.error} />
                <ThemedText type="body" style={{ color: theme.error, fontWeight: "600" }}>
                  Delete Record
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        {isLoading ? (
          <View style={{ paddingTop: headerHeight + Spacing.lg }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <CallItemSkeleton key={i} />
            ))}
          </View>
        ) : (
          <FlatList
            data={calls}
            renderItem={renderCall}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingTop: headerHeight + Spacing.lg,
              paddingBottom: insets.bottom + 80,
              flexGrow: 1,
            }}
            scrollIndicatorInsets={{ bottom: insets.bottom }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={theme.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Feather name="phone" size={48} color={theme.textSecondary} />
                <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No calls yet
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Your call history will appear here
                </ThemedText>
              </View>
            }
          />
        )}
        
        <AnimatedPressable
          style={[
            styles.fab,
            {
              backgroundColor: theme.primary,
              bottom: insets.bottom + 20,
            },
          ]}
          onPress={() => setShowDialer(true)}
          scaleValue={0.9}
          hapticType="medium"
        >
          <Feather name="plus" size={28} color="#fff" />
        </AnimatedPressable>
      </View>

      {renderCallDetailModal()}

      <Modal
        visible={showDialer}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDialer(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="body" style={{ fontWeight: "600" }}>Dial Number</ThemedText>
            <Pressable onPress={() => setShowDialer(false)} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          
          <View style={styles.dialerContent}>
            <View style={styles.inputRow}>
              <Pressable 
                style={[styles.countryCode, { backgroundColor: theme.backgroundDefault }]}
                onPress={() => setShowCountryPicker(true)}
              >
                <ThemedText style={{ marginRight: Spacing.xs }}>{getFlagEmoji(selectedCountry.code)}</ThemedText>
                <ThemedText type="body">{selectedCountry.dial}</ThemedText>
                <Feather name="chevron-down" size={14} color={theme.textSecondary} style={{ marginLeft: 2 }} />
              </Pressable>
              
              <TextInput
                style={[
                  styles.dialInput,
                  {
                    backgroundColor: theme.backgroundDefault,
                    color: theme.text,
                  },
                ]}
                placeholder="Phone number"
                placeholderTextColor={theme.textSecondary}
                value={dialNumber}
                onChangeText={handleDialInput}
                keyboardType="phone-pad"
                autoFocus
              />
            </View>
            
            <Pressable
              style={({ pressed }) => [
                styles.dialButton,
                {
                  backgroundColor: isValidPhone ? "#34C759" : theme.backgroundDefault,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={handleDialNumber}
              disabled={!isValidPhone}
            >
              <Feather name="phone" size={24} color={isValidPhone ? "#fff" : theme.textSecondary} />
              <ThemedText 
                type="body" 
                style={{ 
                  color: isValidPhone ? "#fff" : theme.textSecondary, 
                  fontWeight: "600", 
                  marginLeft: Spacing.sm 
                }}
              >
                Call {selectedCountry.dial}{dialNumber}
              </ThemedText>
            </Pressable>
          </View>
        </View>
        
        <Modal
          visible={showCountryPicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowCountryPicker(false)}
        >
          <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <ThemedText type="body" style={{ fontWeight: "600" }}>Select Country</ThemedText>
              <Pressable onPress={() => setShowCountryPicker(false)} style={styles.closeButton}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            
            <View style={[styles.searchInputContainer, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="search" size={18} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search countries..."
                placeholderTextColor={theme.textSecondary}
                value={countrySearchQuery}
                onChangeText={setCountrySearchQuery}
                autoFocus
              />
            </View>
            
            <FlatList
              data={filteredCountries}
              renderItem={renderCountryItem}
              keyExtractor={(item) => item.code}
              ItemSeparatorComponent={() => (
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
              )}
            />
          </View>
        </Modal>
      </Modal>

      <CallActionsSheet
        visible={showCallOptions}
        onClose={() => {
          setShowCallOptions(false);
          setSelectedCallUser(null);
        }}
        onSecureAudioCall={() => {
          if (selectedCallUser) {
            navigation.navigate("AudioCall", {
              callId: "",
              receiverId: selectedCallUser.id,
              receiverName: selectedCallUser.name,
            });
          }
        }}
        onSecureVideoCall={() => {
          if (selectedCallUser) {
            navigation.navigate("VideoCall", {
              callId: "",
              receiverId: selectedCallUser.id,
              receiverName: selectedCallUser.name,
            });
          }
        }}
        phoneNumber={selectedCallUser?.phoneNumber}
        contactName={selectedCallUser?.name || "Contact"}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  callItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  callContent: {
    flex: 1,
  },
  name: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  callDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  callMeta: {
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  callButton: {
    padding: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
    gap: Spacing.md,
  },
  emptyText: {
    marginTop: Spacing.sm,
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  dialerContent: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  inputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  countryCode: {
    flexDirection: "row",
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  dialInput: {
    flex: 1,
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    fontSize: 17,
  },
  dialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  countryFlag: {
    fontSize: 24,
  },
  countryName: {
    flex: 1,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    height: Spacing.inputHeight,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    height: "100%",
  },
  separator: {
    height: 1,
    marginLeft: Spacing.lg,
  },
  detailContent: {
    padding: Spacing.lg,
    gap: Spacing.xl,
  },
  detailUserSection: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  detailAvatar: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  detailCard: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  detailRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minWidth: 110,
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
    fontWeight: "500",
  },
  detailSeparator: {
    height: StyleSheet.hairlineWidth,
  },
  detailActions: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  detailActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
});
