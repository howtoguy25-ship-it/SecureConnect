import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, FlatList, TextInput, Pressable, ActivityIndicator, Alert, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import * as Contacts from "expo-contacts";
import * as Sharing from "expo-sharing";
import { Image } from "expo-image";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

interface AppContact {
  id: string;
  displayName: string;
  phoneNumber: string;
  avatarIndex: number;
  avatarUrl?: string | null;
  isVip: boolean;
  hasApp: boolean;
}

interface DeviceContact {
  id: string;
  name: string;
  phoneNumbers: string[];
}

export default function ContactsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  
  const [permission, setPermission] = useState<Contacts.PermissionResponse | null>(null);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [appContacts, setAppContacts] = useState<AppContact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingContacts, setIsCheckingContacts] = useState(false);

  useEffect(() => {
    checkPermission();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (permission?.granted) {
        loadContacts();
      }
    }, [permission])
  );

  const checkPermission = async () => {
    const status = await Contacts.getPermissionsAsync();
    setPermission(status);
    if (status.granted) {
      loadContacts();
    }
  };

  const requestPermission = async () => {
    const status = await Contacts.requestPermissionsAsync();
    setPermission(status);
    if (status.granted) {
      loadContacts();
    }
  };

  const loadContacts = async () => {
    setIsLoading(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });

      const formattedContacts: DeviceContact[] = data
        .filter((contact) => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map((contact) => ({
          id: contact.id || Math.random().toString(),
          name: contact.name || "Unknown",
          phoneNumbers: contact.phoneNumbers?.map((p) => p.number || "").filter(Boolean) || [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setDeviceContacts(formattedContacts);
      await checkContactsWithApp(formattedContacts);
    } catch (error) {
      console.error("Error loading contacts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkContactsWithApp = async (contacts: DeviceContact[]) => {
    setIsCheckingContacts(true);
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      
      const allPhoneNumbers = contacts.flatMap((c) => c.phoneNumbers);
      
      const response = await fetch(new URL("/api/contacts/check", baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phoneNumbers: allPhoneNumbers }),
      });

      if (response.ok) {
        const { users } = await response.json();
        setAppContacts(users.map((u: any) => ({ ...u, hasApp: true })));
      }
    } catch (error) {
      console.error("Error checking contacts:", error);
    } finally {
      setIsCheckingContacts(false);
    }
  };

  const [openingContactId, setOpeningContactId] = useState<string | null>(null);
  const openingLock = useRef(false);

  const handleContactPress = async (contact: AppContact) => {
    // Synchronous mutex — state alone can race on rapid double-taps.
    if (openingLock.current) return;
    openingLock.current = true;
    setOpeningContactId(contact.id);
    try {
      const token = await getStoredToken();
      if (!token) {
        Alert.alert("Sign in required", "Please sign in again to start a chat.");
        return;
      }
      const baseUrl = getApiUrl();
      const response = await fetch(new URL("/api/conversations", baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ otherUserId: contact.id }),
      });

      if (response.ok) {
        const conversation = await response.json();
        navigation.navigate("Conversation", {
          conversationId: conversation.id,
          otherUserId: contact.id,
          otherUserName: contact.displayName,
        });
        return;
      }

      // Surface failures so the user doesn't perceive the row as "not clickable".
      let errMsg = `Couldn't open chat (status ${response.status}).`;
      try {
        const body = await response.json();
        if (body?.error) errMsg = body.error;
      } catch {}
      console.warn("[Contacts] open chat failed:", response.status, errMsg);
      Alert.alert("Couldn't open chat", errMsg);
    } catch (error: any) {
      console.error("Error creating conversation:", error);
      Alert.alert(
        "Network error",
        "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      openingLock.current = false;
      setOpeningContactId(null);
    }
  };

  const handleInviteContact = async (contact: DeviceContact) => {
    const phoneNumber = contact.phoneNumbers[0];
    const message = `Hey! Join me on Pryvo for secure messaging. Download the app: https://secureconnect.app`;
    
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      
      await fetch(new URL("/api/invite/track", baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phoneNumber }),
      });

      if (Platform.OS === "ios" || Platform.OS === "android") {
        const smsUrl = Platform.OS === "ios"
          ? `sms:${phoneNumber}&body=${encodeURIComponent(message)}`
          : `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
        await Linking.openURL(smsUrl);
      } else {
        Alert.alert("Share", `Invite ${contact.name} via SMS: ${phoneNumber}`);
      }
    } catch (error) {
      console.error("Error inviting contact:", error);
    }
  };

  const handleShareApp = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        Alert.alert(
          "Share Pryvo",
          "Invite your friends to join Pryvo for secure messaging!",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Share Link",
              onPress: () => {
                Linking.openURL("https://secureconnect.app");
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const filteredDeviceContacts = deviceContacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phoneNumbers.some((p) => p.includes(searchQuery))
  );

  const filteredAppContacts = appContacts.filter((contact) =>
    contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.phoneNumber.includes(searchQuery)
  );

  const contactsWithAppSet = new Set(appContacts.map((c) => c.phoneNumber.replace(/\D/g, "")));
  const contactsWithoutApp = filteredDeviceContacts.filter(
    (c) => !c.phoneNumbers.some((p) => contactsWithAppSet.has(p.replace(/\D/g, "")))
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Contacts",
    });
  }, [navigation]);

  if (!permission) {
    return (
      <ThemedView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  if (!permission.granted || Platform.OS === "web") {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing["2xl"] }]}>
        <View style={styles.permissionContainer}>
          <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "20" }]}>
            <Feather name="users" size={56} color={theme.primary} />
          </View>
          <ThemedText type="h3" style={styles.permissionTitle}>
            {Platform.OS === "web" ? "Use Expo Go" : "Access Your Contacts"}
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            {Platform.OS === "web" 
              ? "Contacts are only available on your phone. Scan the QR code with Expo Go to access your contacts."
              : "See which of your friends are already on Pryvo and easily invite others to join."
            }
          </ThemedText>
          
          {Platform.OS === "web" ? (
            <View style={[styles.webHint, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="smartphone" size={24} color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Open the app on your phone using Expo Go to sync your contacts
              </ThemedText>
            </View>
          ) : permission.status === "denied" && !permission.canAskAgain ? (
            <>
              <ThemedText type="small" style={[styles.permissionHint, { color: theme.textSecondary }]}>
                Permission was denied. Please enable it in Settings.
              </ThemedText>
              <Pressable
                style={[styles.permissionButton, { backgroundColor: theme.primary }]}
                onPress={async () => {
                  try {
                    await Linking.openSettings();
                  } catch (e) {}
                }}
              >
                <Feather name="settings" size={20} color="#fff" />
                <ThemedText type="body" style={styles.permissionButtonText}>
                  Open Settings
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[styles.permissionButton, { backgroundColor: theme.primary }]}
              onPress={requestPermission}
            >
              <Feather name="check" size={20} color="#fff" />
              <ThemedText type="body" style={styles.permissionButtonText}>
                Allow Access
              </ThemedText>
            </Pressable>
          )}
        </View>
      </ThemedView>
    );
  }

  const renderAppContact = (contact: AppContact) => (
    <Pressable
      key={contact.id}
      style={({ pressed }) => [
        styles.contactItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
      onPress={() => handleContactPress(contact)}
    >
      {contact.avatarUrl ? (
        <Image
          source={{ uri: contact.avatarUrl }}
          style={styles.avatar}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[contact.avatarIndex || 0] }]}>
          <Feather name="user" size={22} color="#fff" />
        </View>
      )}
      <View style={styles.contactContent}>
        <View style={styles.nameContainer}>
          <ThemedText type="body" style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {contact.displayName}
          </ThemedText>
          {contact.isVip ? (
            <Feather name="award" size={14} color={theme.accent} />
          ) : null}
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
          {contact.phoneNumber}
        </ThemedText>
      </View>
      <View style={[styles.messageButton, { backgroundColor: theme.primary }]}>
        {openingContactId === contact.id ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name="message-circle" size={18} color="#fff" />
        )}
      </View>
    </Pressable>
  );

  const renderDeviceContact = (contact: DeviceContact) => (
    <Pressable
      key={contact.id}
      style={({ pressed }) => [
        styles.contactItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
      onPress={() => handleInviteContact(contact)}
    >
      <View style={[styles.avatar, { backgroundColor: theme.backgroundTertiary }]}>
        <Feather name="user" size={22} color={theme.textSecondary} />
      </View>
      <View style={styles.contactContent}>
        <ThemedText type="body" style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {contact.name}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
          {contact.phoneNumbers[0]}
        </ThemedText>
      </View>
      <View style={[styles.inviteButton, { backgroundColor: theme.success }]}>
        <Feather name="send" size={16} color="#fff" />
        <ThemedText type="small" style={styles.inviteButtonText}>
          Invite
        </ThemedText>
      </View>
    </Pressable>
  );

  const hasNoContacts = filteredAppContacts.length === 0 && contactsWithoutApp.length === 0;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.searchContainer, { paddingTop: headerHeight + Spacing["2xl"] }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="search" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search contacts"
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        
        <Pressable
          style={[styles.shareButton, { backgroundColor: theme.primary }]}
          onPress={handleShareApp}
        >
          <Feather name="share-2" size={18} color="#fff" />
          <ThemedText type="small" style={styles.shareButtonText}>
            Share App
          </ThemedText>
        </Pressable>
      </View>

      {isLoading || isCheckingContacts ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.lg }}>
            {isCheckingContacts ? "Finding friends on Pryvo..." : "Loading contacts..."}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={[1]}
          keyExtractor={() => "sections"}
          renderItem={() => (
            <View>
              {filteredAppContacts.length > 0 ? (
                <>
                  <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
                    <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                      On Pryvo ({filteredAppContacts.length})
                    </ThemedText>
                  </View>
                  {filteredAppContacts.map(renderAppContact)}
                </>
              ) : null}
              
              {contactsWithoutApp.length > 0 ? (
                <>
                  <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
                    <ThemedText type="small" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                      Invite to Pryvo ({contactsWithoutApp.length})
                    </ThemedText>
                  </View>
                  {contactsWithoutApp.slice(0, 50).map(renderDeviceContact)}
                  {contactsWithoutApp.length > 50 ? (
                    <ThemedText type="small" style={[styles.moreContacts, { color: theme.textSecondary }]}>
                      + {contactsWithoutApp.length - 50} more contacts
                    </ThemedText>
                  ) : null}
                </>
              ) : null}
            </View>
          )}
          contentContainerStyle={{
            paddingBottom: insets.bottom + Spacing["3xl"],
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          ListEmptyComponent={
            hasNoContacts ? (
              <View style={styles.emptyContainer}>
                <Feather name="users" size={56} color={theme.textSecondary} />
                <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No contacts found
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
                  {searchQuery ? "Try a different search" : "Your contacts will appear here"}
                </ThemedText>
              </View>
            ) : null
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  permissionIcon: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  permissionTitle: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  permissionText: {
    textAlign: "center",
    marginBottom: Spacing["2xl"],
    lineHeight: 24,
  },
  permissionHint: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  webHint: {
    flexDirection: "column",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  searchContainer: {
    paddingHorizontal: Spacing["2xl"],
    paddingBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight + 4,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  shareButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeader: {
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
  },
  sectionTitle: {
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  contactContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
    flexShrink: 1,
  },
  name: {
    fontWeight: "600",
  },
  messageButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  inviteButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
    paddingHorizontal: Spacing["3xl"],
    gap: Spacing.lg,
  },
  emptyText: {
    marginTop: Spacing.md,
  },
  moreContacts: {
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
});
