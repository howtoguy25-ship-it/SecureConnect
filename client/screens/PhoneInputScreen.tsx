import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { sendVerificationCode } from "@/lib/auth";
import { ALL_COUNTRIES as SHARED_COUNTRIES } from "@/constants/countries";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "PhoneInput">;

interface Country {
  name: string;
  code: string;
  dial: string;
  flag: string;
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
  message?: string;
}

const ALL_COUNTRIES: Country[] = SHARED_COUNTRIES;

const DEFAULT_COUNTRIES: Country[] = ALL_COUNTRIES;
const US_COUNTRY = ALL_COUNTRIES.find((c) => c.code === "US")!;

const getFlagEmoji = (countryCode: string) => {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export default function PhoneInputScreen() {
  const navigation = useNavigation<NavigationProp>();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [countries] = useState<Country[]>(DEFAULT_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState<Country>(US_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);

  const { data: geoData, isLoading: isLoadingGeo } = useQuery<GeoPermissionsResponse>({
    queryKey: ['/api/auth/geo-permissions'],
    staleTime: 6 * 60 * 60 * 1000,
  });

  // Reviewer login button visibility — owner toggles via Settings.
  const { data: reviewModeData } = useQuery<{ reviewMode: boolean }>({
    queryKey: ['/api/review-mode'],
  });
  const isReviewMode = reviewModeData?.reviewMode ?? false;

  useEffect(() => {
    if (geoData) {
      setIsConfigured(geoData.countriesConfigured);
    }
  }, [geoData]);

  const filteredCountries = countries.filter(
    (country) =>
      country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      country.dial.includes(searchQuery) ||
      country.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    setPhoneNumber(cleaned);
    setError("");
  };

  const handleReviewerLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError("");
    const reviewerNumber = "+15551234567";
    const result = await sendVerificationCode(reviewerNumber);
    setIsLoading(false);
    if (result.success) {
      navigation.navigate("VerifyCode", { phoneNumber: reviewerNumber, demoCode: "123456" });
    } else {
      setError(result.error || "Reviewer login failed. Please enter +1 555-123-4567 manually with code 123456.");
    }
  };

  const handleContinue = async () => {
    if (isLoading) return;

    const trimmed = phoneNumber.trim();
    if (trimmed.length < 6 || trimmed.length > 15) {
      setError("Please enter a valid phone number");
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      setError("Phone number can only contain digits");
      return;
    }

    setIsLoading(true);
    setError("");

    // Strip a leading trunk "0" before prefixing the country code — see
    // the identical fix + explanation in WelcomeScreen.tsx's handleContinue.
    const nationalNumber = trimmed.replace(/^0+/, "");
    const fullNumber = `${selectedCountry.dial}${nationalNumber}`;
    const result = await sendVerificationCode(fullNumber);

    setIsLoading(false);

    if (result.success) {
      const digitsOnly = fullNumber.replace(/\D/g, '');
      const isTestNumber = digitsOnly.endsWith('5551234567') || digitsOnly.endsWith('5550000000');
      navigation.navigate("VerifyCode", {
        phoneNumber: fullNumber,
        ...(isTestNumber ? { demoCode: "123456" } : {}),
      });
    } else {
      setError(result.error || "Couldn't send verification code. Please check your number and try again.");
    }
  };

  const handleSelectCountry = (country: Country) => {
    setSelectedCountry(country);
    setShowCountryPicker(false);
    setSearchQuery("");
  };

  const isValid = phoneNumber.length >= 6;

  const renderCountryItem = ({ item }: { item: Country }) => (
    <Pressable
      style={[
        styles.countryItem,
        { borderBottomColor: theme.border },
      ]}
      onPress={() => handleSelectCountry(item)}
    >
      <ThemedText style={styles.countryFlag}>{getFlagEmoji(item.code)}</ThemedText>
      <ThemedText type="body" style={styles.countryName}>
        {item.name}
      </ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary }}>
        {item.dial}
      </ThemedText>
    </Pressable>
  );

  return (
    <>
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <View style={styles.form}>
          <ThemedText type="h2" style={styles.title}>
            Enter your phone number
          </ThemedText>

          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            We'll send you a verification code to confirm your identity
          </ThemedText>

          {isLoadingGeo ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: Spacing.sm }}>
                Loading available countries...
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Pressable
              style={[styles.countrySelector, { backgroundColor: theme.backgroundDefault }]}
              onPress={() => setShowCountryPicker(true)}
            >
              <ThemedText style={styles.selectedFlag}>
                {getFlagEmoji(selectedCountry.code)}
              </ThemedText>
              <ThemedText type="body">{selectedCountry.dial}</ThemedText>
              <Feather name="chevron-down" size={16} color={theme.textSecondary} />
            </Pressable>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: error ? theme.error : "transparent",
                },
              ]}
              placeholder="Phone number"
              placeholderTextColor={theme.textSecondary}
              value={phoneNumber}
              onChangeText={handlePhoneChange}
              keyboardType="phone-pad"
              autoFocus
              editable={!isLoading}
            />
          </View>

          {error ? (
            <ThemedText type="small" style={[styles.error, { color: theme.error }]}>
              {error}
            </ThemedText>
          ) : null}

          {countries.length > 0 && !isLoadingGeo ? (
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
              {countries.length} {countries.length === 1 ? 'country' : 'countries'} available
            </ThemedText>
          ) : null}

          {!isConfigured && !isLoadingGeo && geoData?.message ? (
            <View style={[styles.warningContainer, { backgroundColor: theme.warning + '20' }]}>
              <Feather name="alert-circle" size={16} color={theme.warning} />
              <ThemedText type="small" style={{ color: theme.warning, flex: 1, marginLeft: Spacing.sm }}>
                {geoData.message}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <Button
          onPress={handleContinue}
          disabled={!isValid || isLoading}
          style={styles.button}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : "Continue"}
        </Button>

        {/* Visibility controlled by owner via Settings → App Store Review Mode.
            Server bypass for +1 555-123-4567 / 555-000-0000 still fires
            unconditionally, so manual reviewer login always works. */}
        {isReviewMode ? (
          <Pressable
            onPress={handleReviewerLogin}
            disabled={isLoading}
            style={styles.reviewerLink}
          >
            <Feather name="smartphone" size={14} color={theme.primary} />
            <ThemedText type="small" style={[styles.reviewerLinkText, { color: theme.primary }]}>
              Apple Reviewer Login (code: 123456)
            </ThemedText>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => navigation.navigate("RecoverAccount")}
          disabled={isLoading}
          style={styles.reviewerLink}
        >
          <Feather name="key" size={14} color={theme.textSecondary} />
          <ThemedText type="small" style={[styles.reviewerLinkText, { color: theme.textSecondary }]}>
            Forgot access? Recover your account
          </ThemedText>
        </Pressable>
      </KeyboardAwareScrollViewCompat>

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
                setSearchQuery("");
              }}
              style={styles.closeButton}
            >
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search country or code..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")}>
                <Feather name="x-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {filteredCountries.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: 'center' }}>
                No countries found
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={renderCountryItem}
              contentContainerStyle={styles.countryList}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: "space-between",
  },
  form: {
    gap: Spacing.lg,
    width: "100%",
    maxWidth: "100%",
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.xl,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
    maxWidth: "100%",
    alignItems: "center",
    overflow: "hidden",
  },
  countrySelector: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
    flexShrink: 0,
  },
  selectedFlag: {
    fontSize: 20,
  },
  input: {
    // flex: 1 with minWidth: 0 + flexBasis: 0 lets the input shrink past
    // its content size inside a flex row — the canonical fix for the
    // "input pushes past the right edge" bug on web and small screens.
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexShrink: 1,
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    fontSize: 17,
    borderWidth: 2,
  },
  error: {
    marginTop: Spacing.xs,
  },
  button: {
    marginTop: Spacing.xl,
  },
  reviewerLink: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  reviewerLinkText: {
    fontWeight: "500",
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
    padding: Spacing.xs,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.xs,
  },
  countryList: {
    paddingHorizontal: Spacing.lg,
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  countryFlag: {
    fontSize: 24,
  },
  countryName: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
  },
});
