import React, { useState, useEffect } from "react";
import { View, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator, Modal, Alert, Linking, Platform, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { HeaderButton, useHeaderHeight } from "@react-navigation/elements";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

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

interface SearchResult {
  id: string;
  displayName: string;
  phoneNumber: string;
  avatarIndex: number;
  isVip: boolean;
}

export default function NewMessageScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user, numberMode } = useAuth();
  // This screen is a modal with a transparent header — without explicit top
  // padding the phone-number input renders underneath the header and the
  // screen looks mostly empty/hidden on device.
  const topPadding = headerHeight > 0 ? headerHeight + Spacing.md : insets.top + Spacing.xl;
  
  const [countries, setCountries] = useState<Country[]>(DEFAULT_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedNumber, setSearchedNumber] = useState("");
  const [isSendingInvite, setIsSendingInvite] = useState(false);

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

  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    setPhoneNumber(cleaned);
    setHasSearched(false);
  };

  const getFullPhoneNumber = () => {
    return `${selectedCountry.dial}${phoneNumber}`;
  };

  const handleSearch = async () => {
    if (phoneNumber.length < 6) return;

    setIsSearching(true);
    setHasSearched(true);
    const fullNumber = getFullPhoneNumber();
    setSearchedNumber(fullNumber);

    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL(`/api/users/search?phone=${encodeURIComponent(fullNumber)}`, baseUrl), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendInvite = async () => {
    if (!searchedNumber) return;
    
    setIsSendingInvite(true);
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/invite/send', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ phoneNumber: searchedNumber }),
      });
      
      if (response.ok) {
        Alert.alert(
          "Invite Sent",
          `We've sent an SMS invite to ${searchedNumber}. They'll be able to message you once they join SecureChat.`,
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      } else {
        const error = await response.json();
        Alert.alert("Error", error.error || "Failed to send invite. Please try again.");
      }
    } catch (error) {
      console.error('Error sending invite:', error);
      Alert.alert("Error", "Failed to send invite. Please try again.");
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleShareWhatsApp = async () => {
    const senderName = user?.displayName || "Someone";
    const appStoreLink = "https://apps.apple.com/app/secureconnect-chat/id6744919552";
    const message = `Hey! ${senderName} wants to chat with you on Pryvo - a secure messaging app. Download it here: ${appStoreLink}`;
    const whatsappNumber = searchedNumber.replace(/\+/g, "");
    
    const whatsappUrl = Platform.select({
      ios: `whatsapp://send?phone=${whatsappNumber}&text=${encodeURIComponent(message)}`,
      android: `whatsapp://send?phone=${whatsappNumber}&text=${encodeURIComponent(message)}`,
      default: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
    });

    try {
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        Alert.alert(
          "WhatsApp Not Available",
          "WhatsApp is not installed on this device. You can send an SMS invite instead.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("Error opening WhatsApp:", error);
      Alert.alert("Error", "Could not open WhatsApp. Please try again.");
    }
  };

  const handleShareApp = async () => {
    const senderName = user?.displayName || "A friend";
    const appStoreLink = "https://apps.apple.com/app/secureconnect-chat/id6744919552";
    const message = `${senderName} wants to chat with you on Pryvo - a secure encrypted messaging app. Download here: ${appStoreLink}`;
    
    try {
      await Share.share({
        message: message,
        title: "Join Pryvo",
      });
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleSelectUser = async (user: SearchResult) => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/conversations', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ otherUserId: user.id, numberType: numberMode }),
      });
      
      if (response.ok) {
        const conversation = await response.json();
        navigation.replace("Conversation", {
          conversationId: conversation.id,
          otherUserId: user.id,
          otherUserName: user.displayName,
        });
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const renderResult = ({ item }: { item: SearchResult }) => (
    <Pressable
      style={({ pressed }) => [
        styles.resultItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
      onPress={() => handleSelectUser(item)}
    >
      <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[item.avatarIndex || 0] }]}>
        <Feather name="user" size={20} color="#fff" />
      </View>
      
      <View style={styles.resultContent}>
        <View style={styles.nameContainer}>
          <ThemedText type="body" style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {item.displayName}
          </ThemedText>
          {item.isVip ? (
            <Feather name="award" size={14} color={theme.accent} />
          ) : null}
        </View>
        <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
          {item.phoneNumber}
        </ThemedText>
      </View>
      
      <Feather name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton onPress={() => navigation.goBack()}>
          <ThemedText type="body" style={{ color: theme.primary }}>
            Cancel
          </ThemedText>
        </HeaderButton>
      ),
    });
  }, [navigation, theme]);

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

  const isValidPhone = phoneNumber.length >= 6;

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, paddingTop: topPadding }]}>
        <View style={styles.searchContainer}>
          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            ENTER PHONE NUMBER
          </ThemedText>
          
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
                styles.input,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                },
              ]}
              placeholder="Phone number"
              placeholderTextColor={theme.textSecondary}
              value={phoneNumber}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              autoFocus
            />
            
            <Pressable
              style={[
                styles.searchButton,
                {
                  backgroundColor: isValidPhone ? theme.primary : theme.backgroundDefault,
                },
              ]}
              onPress={handleSearch}
              disabled={!isValidPhone || isSearching}
            >
              {isSearching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather
                  name="search"
                  size={20}
                  color={isValidPhone ? "#fff" : theme.textSecondary}
                />
              )}
            </Pressable>
          </View>
        </View>

        <FlatList
          data={searchResults}
          renderItem={renderResult}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom: insets.bottom + Spacing.xl,
          }}
          ListEmptyComponent={
            hasSearched && !isSearching ? (
              <View style={styles.emptyContainer}>
                <Feather name="user-plus" size={48} color={theme.primary} />
                <ThemedText type="body" style={{ color: theme.text, fontWeight: "600" }}>
                  Not on SecureChat yet
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.lg }}>
                  {searchedNumber} isn't registered. Send them an invite to start messaging!
                </ThemedText>
                <View style={styles.inviteButtonsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.inviteButton,
                      { 
                        backgroundColor: theme.primary,
                        opacity: pressed ? 0.8 : 1,
                        flex: 1,
                      },
                    ]}
                    onPress={handleSendInvite}
                    disabled={isSendingInvite}
                  >
                    {isSendingInvite ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="send" size={18} color="#fff" />
                        <ThemedText type="body" style={{ color: "#fff", fontWeight: "600", marginLeft: Spacing.sm }}>
                          SMS
                        </ThemedText>
                      </>
                    )}
                  </Pressable>
                  
                  <Pressable
                    style={({ pressed }) => [
                      styles.inviteButton,
                      { 
                        backgroundColor: "#25D366",
                        opacity: pressed ? 0.8 : 1,
                        flex: 1,
                      },
                    ]}
                    onPress={handleShareWhatsApp}
                  >
                    <Feather name="message-circle" size={18} color="#fff" />
                    <ThemedText type="body" style={{ color: "#fff", fontWeight: "600", marginLeft: Spacing.sm }}>
                      WhatsApp
                    </ThemedText>
                  </Pressable>
                </View>
                
                <Pressable
                  style={({ pressed }) => [
                    styles.shareAppButton,
                    { 
                      backgroundColor: theme.backgroundDefault,
                      borderColor: theme.primary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                  onPress={handleShareApp}
                >
                  <Feather name="share-2" size={18} color={theme.primary} />
                  <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600", marginLeft: Spacing.sm }}>
                    Share App
                  </ThemedText>
                </Pressable>
              </View>
            ) : !hasSearched ? (
              <View style={styles.emptyContainer}>
                <Feather name="search" size={48} color={theme.textSecondary} />
                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                  Search for a contact
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
                  Enter a phone number to find SecureChat users or invite someone new
                </ThemedText>
              </View>
            ) : null
          }
        />
      </View>

      <Modal
        visible={showCountryPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <ThemedText type="h3">Select Country</ThemedText>
            <Pressable
              onPress={() => {
                setShowCountryPicker(false);
                setCountrySearchQuery("");
              }}
              style={styles.closeButton}
            >
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
            contentContainerStyle={{ paddingBottom: insets.bottom }}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  label: {
    fontWeight: "600",
    marginLeft: Spacing.sm,
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
  input: {
    flex: 1,
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    fontSize: 17,
  },
  searchButton: {
    width: Spacing.inputHeight,
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  resultItem: {
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
  resultContent: {
    flex: 1,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
    flexShrink: 1,
    marginBottom: Spacing.xs,
  },
  name: {
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
    paddingHorizontal: Spacing["2xl"],
    gap: Spacing.md,
  },
  inviteButtonsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    width: "100%",
  },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  shareAppButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    marginTop: Spacing.md,
    width: "100%",
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
  separator: {
    height: 1,
    marginLeft: Spacing.lg,
  },
});
