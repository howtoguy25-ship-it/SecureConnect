import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  Animated,
  Platform,
  Linking,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather, AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { sendVerificationCode, fetchOAuthConfig, signInWithApple, signInWithGoogle, OAuthConfig } from "@/lib/auth";
import { useAuth, ensureE2EEKeys } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { ALL_COUNTRIES } from "@/constants/countries";

const GOOGLE_WEB_CLIENT_ID = (Constants.expoConfig?.extra as any)?.GOOGLE_WEB_CLIENT_ID || "";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "Welcome">;

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

interface AnnouncementData {
  activeUsers: number;
  totalUsers: number;
  recentMessage: string;
}

const DEFAULT_COUNTRIES: Country[] = ALL_COUNTRIES;

const ENCRYPTION_QUOTES = [
  "End-to-End Encrypted Messaging",
  "Your Privacy, Our Priority",
  "Secure Conversations, Always",
  "Protected by Military-Grade Encryption",
  "Messages Only You Can Read",
  "Private by Design",
  "Zero Access to Your Data",
  "Trusted by Millions Worldwide",
];

const getCountryBadge = (countryCode: string) => {
  return countryCode.toUpperCase();
};

const openLegalPage = async (path: string) => {
  const url = new URL(path, getApiUrl()).toString();
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      const { default: WebBrowser } = await import('expo-web-browser');
      await WebBrowser.openBrowserAsync(url);
    }
  } catch {
    Linking.openURL(url).catch(() => {});
  }
};

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { setUser, setToken, setSecurityQuestionsPending } = useAuth();

  const [countries, setCountries] = useState<Country[]>(DEFAULT_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRIES[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentQuoteIndex, setCurrentQuoteIndex] = useState(0);
  const [oauthLoadingProvider, setOauthLoadingProvider] = useState<"apple" | "google" | null>(null);
  // Set once a first-time Apple/Google sign-in comes back "not linked to any
  // account yet" — the user still verifies a phone number below, but this
  // token rides along so /api/auth/verify-code attaches that identity to
  // whichever account the phone verification produces.
  const [pendingOAuthLink, setPendingOAuthLink] = useState<{ provider: "apple" | "google"; token: string; email: string | null } | null>(null);

  const quoteOpacity = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const { data: reviewModeData } = useQuery<{ reviewMode: boolean }>({
    queryKey: ['/api/review-mode'],
    staleTime: 0,
  });
  const isReviewMode = reviewModeData?.reviewMode ?? false;

  const { data: geoData, isLoading: isLoadingGeo } = useQuery<GeoPermissionsResponse>({
    queryKey: ['/api/auth/geo-permissions'],
    staleTime: 6 * 60 * 60 * 1000,
  });

  const { data: announcementData } = useQuery<AnnouncementData>({
    queryKey: ['/api/stats/announcement'],
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const { data: oauthConfig } = useQuery<OAuthConfig>({
    queryKey: ['/api/auth/oauth-config'],
    queryFn: fetchOAuthConfig,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const finishOAuthLogin = async (token: string, user: any) => {
    setToken(token);
    try {
      await ensureE2EEKeys(token);
    } catch (e) {
      console.log("E2EE setup failed:", e);
    }
    if (user.hasSecurityQuestions) {
      setSecurityQuestionsPending(true);
    }
    setUser(user);
  };

  const handleAppleSignIn = async () => {
    if (oauthLoadingProvider) return;
    setOauthLoadingProvider("apple");
    setError("");
    try {
      const result = await signInWithApple();
      if (result.linked) {
        if (result.success && result.token && result.user) {
          await finishOAuthLogin(result.token, result.user);
        } else {
          setError("Couldn't sign in with Apple. Please try again.");
        }
      } else {
        setPendingOAuthLink({ provider: "apple", token: result.linkToken, email: result.email });
      }
    } catch (e: any) {
      if (e?.code !== "ERR_REQUEST_CANCELED") {
        setError(e?.message || "Couldn't sign in with Apple. Please try again.");
      }
    } finally {
      setOauthLoadingProvider(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (oauthLoadingProvider) return;
    if (!GOOGLE_WEB_CLIENT_ID) return;
    setOauthLoadingProvider("google");
    setError("");
    try {
      const result = await signInWithGoogle(GOOGLE_WEB_CLIENT_ID);
      if (result.linked) {
        if (result.success && result.token && result.user) {
          await finishOAuthLogin(result.token, result.user);
        } else {
          setError("Couldn't sign in with Google. Please try again.");
        }
      } else {
        setPendingOAuthLink({ provider: "google", token: result.linkToken, email: result.email });
      }
    } catch (e: any) {
      if (e?.message !== "__CANCELLED__") {
        setError(e?.message || "Couldn't sign in with Google. Please try again.");
      }
    } finally {
      setOauthLoadingProvider(null);
    }
  };

  useEffect(() => {
    if (geoData?.countries && geoData.countries.length > 0) {
      // Surface the geo/Twilio-preferred countries first, then keep the full
      // global list available so every country remains selectable.
      const preferred: Country[] = geoData.countries.map((c) => ({
        name: c.name,
        code: c.isoCode,
        dial: c.dialCode,
        flag: c.isoCode,
      }));
      const preferredCodes = new Set(preferred.map((c) => c.code));
      const rest = ALL_COUNTRIES.filter((c) => !preferredCodes.has(c.code));
      setCountries([...preferred, ...rest]);
    }
  }, [geoData]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(quoteOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 0,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentQuoteIndex((prev) => (prev + 1) % ENCRYPTION_QUOTES.length);
        slideAnim.setValue(20);
        Animated.parallel([
          Animated.timing(quoteOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

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

    // Most countries' national numbers are written with a leading trunk
    // "0" that must be dropped once a country code is prefixed (e.g. an
    // Australian mobile is locally "0474 011 265" but internationally
    // "+61474011265", not "+610474011265"). Without stripping it, this
    // produced an invalid E.164 number that DID still often reach the
    // carrier for verification, but silently broke any later server-side
    // SMS send that validates the "to" number strictly (e.g. Twilio
    // rejecting the account-deletion confirmation code with "please enter
    // a valid phone number"). No real NANP/mobile number legitimately
    // starts with 0 after its country code, so this is safe everywhere.
    const nationalNumber = trimmed.replace(/^0+/, "");
    const fullNumber = `${selectedCountry.dial}${nationalNumber}`;
    const result = await sendVerificationCode(fullNumber);

    setIsLoading(false);

    if (result.success) {
      navigation.navigate("VerifyCode", {
        phoneNumber: fullNumber,
        ...(pendingOAuthLink ? { oauthLinkToken: pendingOAuthLink.token } : {}),
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

  const handleDemoLogin = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const demoFullNumber = `${DEFAULT_COUNTRIES[0].dial}5551234567`;
    const result = await sendVerificationCode(demoFullNumber);

    setIsLoading(false);

    if (result.success) {
      navigation.navigate("VerifyCode", { phoneNumber: demoFullNumber, demoCode: "123456" });
    } else {
      setSelectedCountry(DEFAULT_COUNTRIES[0]);
      setPhoneNumber("5551234567");
      setError(result.error || "Demo login failed. Please try manually with code: 123456");
    }
  }, [navigation]);

  const gradientColors = isDark
    ? ['#140F26', '#1F1638', '#3A2160'] as const
    : ['#667eea', '#764ba2', '#f093fb'] as const;

  const renderCountryItem = ({ item }: { item: Country }) => (
    <Pressable
      style={[
        styles.countryItem,
        { borderBottomColor: theme.border },
      ]}
      onPress={() => handleSelectCountry(item)}
    >
      <View style={styles.countryBadge}>
        <ThemedText style={styles.countryBadgeText}>{getCountryBadge(item.code)}</ThemedText>
      </View>
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
      <LinearGradient
        colors={gradientColors}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <KeyboardAwareScrollViewCompat
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + Spacing.lg,
              paddingBottom: insets.bottom + Spacing.xl,
            },
          ]}
        >
          {announcementData ? (
            <View style={styles.announcementBar}>
              <View style={styles.announcementDot} />
              <ThemedText type="small" style={styles.announcementText}>
                {announcementData.activeUsers.toLocaleString()} users online
                {announcementData.recentMessage ? ` - ${announcementData.recentMessage}` : ''}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.brandingContainer}>
            <Image
              source={require("../../assets/images/logo-transparent.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <ThemedText type="h1" style={styles.brandName} numberOfLines={1} adjustsFontSizeToFit>
              Pryvo
            </ThemedText>
            
            <Animated.View 
              style={[
                styles.quoteContainer,
                { 
                  opacity: quoteOpacity,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <View style={styles.quoteWrapper}>
                <Feather name="lock" size={14} color="rgba(255,255,255,0.8)" />
                <ThemedText type="body" style={styles.quoteText}>
                  {ENCRYPTION_QUOTES[currentQuoteIndex]}
                </ThemedText>
              </View>
            </Animated.View>
          </View>

          <View style={styles.formCard}>
              <ThemedText type="h3" style={[styles.formTitle, { color: "#FFFFFF" }]}>
                Enter your phone number
              </ThemedText>

              <ThemedText type="body" style={[styles.formSubtitle, { color: "rgba(255,255,255,0.6)" }]}>
                We'll send a verification code via SMS
              </ThemedText>

              {isLoadingGeo ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.primary} />
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.6)", marginLeft: Spacing.sm }}>
                    Loading countries...
                  </ThemedText>
                </View>
              ) : null}

              {(oauthConfig?.appleEnabled || (oauthConfig?.googleEnabled && GOOGLE_WEB_CLIENT_ID)) ? (
                <View style={styles.oauthSection}>
                  {oauthConfig?.appleEnabled ? (
                    <Pressable
                      style={[styles.oauthButton, styles.appleButton]}
                      onPress={handleAppleSignIn}
                      disabled={!!oauthLoadingProvider}
                    >
                      {oauthLoadingProvider === "apple" ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <AntDesign name="apple" size={18} color="#fff" />
                          <ThemedText type="body" style={styles.oauthButtonText}>
                            Continue with Apple
                          </ThemedText>
                        </>
                      )}
                    </Pressable>
                  ) : null}

                  {oauthConfig?.googleEnabled && GOOGLE_WEB_CLIENT_ID ? (
                    <Pressable
                      style={[styles.oauthButton, styles.googleButton]}
                      onPress={handleGoogleSignIn}
                      disabled={!!oauthLoadingProvider}
                    >
                      {oauthLoadingProvider === "google" ? (
                        <ActivityIndicator color="#1a1a1a" />
                      ) : (
                        <>
                          <AntDesign name="google" size={18} color="#4285F4" />
                          <ThemedText type="body" style={styles.googleButtonText}>
                            Continue with Google
                          </ThemedText>
                        </>
                      )}
                    </Pressable>
                  ) : null}

                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <ThemedText type="small" style={{ color: "rgba(255,255,255,0.5)", marginHorizontal: Spacing.sm }}>
                      or use your phone number
                    </ThemedText>
                    <View style={styles.dividerLine} />
                  </View>
                </View>
              ) : null}

              {pendingOAuthLink ? (
                <View style={styles.pendingLinkBanner}>
                  <Feather name="check-circle" size={16} color={theme.primary} />
                  <ThemedText type="small" style={{ color: "rgba(255,255,255,0.8)", flex: 1, marginLeft: Spacing.sm }}>
                    Signed in with {pendingOAuthLink.provider === "apple" ? "Apple" : "Google"}. Verify your phone number below to finish setup.
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.inputContainer}>
                <Pressable
                  style={[styles.countrySelector, { backgroundColor: "rgba(255,255,255,0.1)" }]}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <View style={styles.selectedBadge}>
                    <ThemedText style={styles.selectedBadgeText}>
                      {getCountryBadge(selectedCountry.code)}
                    </ThemedText>
                  </View>
                  <ThemedText type="body" style={{ color: "#FFFFFF" }}>{selectedCountry.dial}</ThemedText>
                  <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.6)" />
                </Pressable>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: "rgba(255,255,255,0.1)",
                      color: "#FFFFFF",
                      borderColor: error ? theme.error : "rgba(255,255,255,0.2)",
                    },
                  ]}
                  placeholder="Phone number"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={phoneNumber}
                  onChangeText={handlePhoneChange}
                  keyboardType="phone-pad"
                  editable={!isLoading}
                />
              </View>

              {error ? (
                <ThemedText type="small" style={[styles.error, { color: theme.error }]}>
                  {error}
                </ThemedText>
              ) : null}

              <Button
                onPress={handleContinue}
                disabled={!isValid || isLoading}
                style={styles.button}
              >
                {isLoading ? <ActivityIndicator color="#fff" /> : "Continue"}
              </Button>

              {/*
                Reviewer shortcut — visibility controlled by the owner via
                Settings → App Store Review Mode (server flag `reviewMode`).
                Owner turns this ON during the App Store review window and
                OFF the rest of the time so real users don't see it. The
                server-side bypass for the reserved NANP fictional numbers
                (+1 555-123-4567 / 555-000-0000) is permanent and fires
                regardless of this flag, so reviewers can ALWAYS still log
                in by typing the number manually if needed.
              */}
              {isReviewMode ? (
                <Pressable onPress={handleDemoLogin} style={styles.demoLoginLink}>
                  <Feather name="smartphone" size={14} color={theme.primary} />
                  <ThemedText type="small" style={[styles.demoLoginText, { color: theme.primary }]}>
                    Apple Reviewer Login (code: 123456)
                  </ThemedText>
                </Pressable>
              ) : null}

              <View style={styles.termsContainer}>
                <ThemedText type="small" style={[styles.termsText, { color: "rgba(255,255,255,0.5)", textAlign: "center" }]}>
                  By continuing you agree to our{" "}
                </ThemedText>
                <Pressable onPress={() => openLegalPage('/terms')}>
                  <ThemedText type="small" style={[styles.termsLink, { color: theme.primary }]}>
                    Terms of Service
                  </ThemedText>
                </Pressable>
                <ThemedText type="small" style={[styles.termsText, { color: "rgba(255,255,255,0.5)" }]}>
                  {" "}and{" "}
                </ThemedText>
                <Pressable onPress={() => openLegalPage('/privacy')}>
                  <ThemedText type="small" style={[styles.termsLink, { color: theme.primary }]}>
                    Privacy Policy
                  </ThemedText>
                </Pressable>
                <ThemedText
                  type="small"
                  style={[
                    styles.termsText,
                    { color: "rgba(255,255,255,0.5)", marginTop: 8, textAlign: "center" },
                  ]}
                >
                  Pryvo has zero tolerance for objectionable content or abusive users. Anyone who posts harassment, threats, hate speech, or sexual content involving minors will be removed and reported. You can block or report any user at any time from inside a chat.
                </ThemedText>
              </View>
            </View>

          <View style={styles.featuresRow}>
            <FeatureChip icon="lock" label="Encrypted" />
            <FeatureChip icon="shield" label="Secure" />
            <FeatureChip icon="zap" label="Fast" />
          </View>

          {/* Owner-only shortcut, web only — the mobile apps never need this
              since the owner already gets full admin tools in Settings
              after a normal login. On web it's the fastest way in. */}
          {Platform.OS === "web" ? (
            <Pressable onPress={() => navigation.navigate("AdminLogin")} style={styles.adminLink}>
              <Feather name="shield" size={12} color="rgba(255,255,255,0.5)" />
              <ThemedText type="small" style={styles.adminLinkText}>
                Admin sign in
              </ThemedText>
            </Pressable>
          ) : null}
        </KeyboardAwareScrollViewCompat>
      </LinearGradient>

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

function FeatureChip({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={styles.featureChip}>
      <Feather name={icon} size={14} color="rgba(255,255,255,0.9)" />
      <ThemedText type="small" style={styles.featureChipText}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  announcementBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.xl,
    alignSelf: "center",
  },
  announcementDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
    marginRight: Spacing.sm,
  },
  announcementText: {
    color: "rgba(255,255,255,0.95)",
    fontWeight: "500",
  },
  brandingContainer: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: Spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  brandName: {
    color: "#fff",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minWidth: 200,
  },
  quoteContainer: {
    minHeight: 30,
  },
  quoteWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  quoteText: {
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
  },
  formCard: {
    backgroundColor: "rgba(0,0,0,0.92)",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  formTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  formSubtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  oauthSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  oauthButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  appleButton: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  googleButton: {
    backgroundColor: "#fff",
  },
  oauthButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  googleButtonText: {
    color: "#1a1a1a",
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  pendingLinkBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(124,92,252,0.15)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  inputContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  countrySelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.md,
    flexShrink: 0,
  },
  selectedBadge: {
    backgroundColor: "#7C5CFC",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  selectedBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexShrink: 1,
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    fontSize: 17,
    borderWidth: 1,
  },
  error: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  button: {
    marginTop: Spacing.sm,
  },
  termsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  termsText: {
    textAlign: "center",
  },
  termsLink: {
    textDecorationLine: "underline",
  },
  featuresRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  featureChipText: {
    color: "rgba(255,255,255,0.95)",
    fontWeight: "500",
  },
  adminLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: Spacing.xl,
    padding: Spacing.sm,
  },
  adminLinkText: {
    color: "rgba(255,255,255,0.5)",
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.xl,
    marginVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
  },
  countryList: {
    paddingHorizontal: Spacing.xl,
  },
  countryItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  countryBadge: {
    backgroundColor: "#7C5CFC",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    minWidth: 32,
    alignItems: "center",
  },
  countryBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
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
  demoLoginLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  demoLoginText: {
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});
