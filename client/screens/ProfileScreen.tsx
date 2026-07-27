import React, { useState, useMemo, useEffect } from "react";
import { View, StyleSheet, Pressable, Alert, ActivityIndicator, TextInput, Modal, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { getStoredToken, updateProfile } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AVATAR_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
];

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user, logout, refreshUser, setUser } = useAuth();
  const queryClient = useQueryClient();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  // Reset the avatar-failed flag any time the avatar URL changes so a fresh
  // upload gets a chance to render even if the previous URL had failed.
  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.avatarUrl]);

  const [showNameModal, setShowNameModal] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const nameChangeInfo = useMemo(() => {
    if (!user?.lastNameChangeAt) {
      return { canChange: true, daysRemaining: 0 };
    }
    const lastChange = new Date(user.lastNameChangeAt);
    const daysSince = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24);
    const daysRemaining = Math.max(0, Math.ceil(30 - daysSince));
    return { canChange: daysSince >= 30, daysRemaining };
  }, [user?.lastNameChangeAt]);

  const handleEditName = () => {
    if (!nameChangeInfo.canChange) {
      Alert.alert(
        "Name Change Limit",
        `You can change your name once every 30 days. Please wait ${nameChangeInfo.daysRemaining} more day${nameChangeInfo.daysRemaining === 1 ? '' : 's'}.`
      );
      return;
    }
    setNewDisplayName(user?.displayName || "");
    setShowNameModal(true);
  };

  const handleSaveName = async () => {
    const trimmedName = newDisplayName.trim();
    if (!trimmedName) {
      Alert.alert("Invalid Name", "Please enter a display name.");
      return;
    }
    if (trimmedName === user?.displayName) {
      setShowNameModal(false);
      return;
    }
    
    setIsSavingName(true);
    try {
      const updatedUser = await updateProfile(trimmedName, user?.avatarIndex || 0);
      if (updatedUser) {
        setUser(updatedUser);
        setShowNameModal(false);
        Alert.alert("Success", "Your name has been updated!");
      } else {
        Alert.alert("Error", "Failed to update your name. Please try again.");
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to update your name. Please try again.";
      Alert.alert("Error", errorMessage);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    const doLogout = async () => {
      setIsLoggingOut(true);
      try {
        await logout();
      } catch {
        setIsLoggingOut(false);
        Alert.alert("Error", "Failed to sign out. Please try again.");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to sign out?")) {
        await doLogout();
      }
    } else {
      Alert.alert(
        "Sign Out",
        "Are you sure you want to sign out?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign Out", style: "destructive", onPress: doLogout },
        ]
      );
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photos to change your profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsUploadingAvatar(true);
        const asset = result.assets[0];

        try {
          const token = await getStoredToken();
          const baseUrl = getApiUrl();

          // Derive a mime type. ImagePicker reports asset.mimeType on most
          // platforms; fall back to extension sniffing then jpeg.
          const extMatch = asset.uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
          const ext = (extMatch?.[1] || "jpg").toLowerCase();
          const extMime: Record<string, string> = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            heic: "image/heic",
            heif: "image/heif",
            webp: "image/webp",
            gif: "image/gif",
          };
          const mimeType = asset.mimeType || extMime[ext] || "image/jpeg";

          // Single round-trip server-proxied upload. The server uploads to
          // GCS for us, sets the public ACL, saves the avatarUrl on the user
          // record, and returns it. No signed URLs, no CORS, no client/SDK
          // version drift — works identically on web/iOS/Android.
          const uploadUrl = new URL("/api/user/avatar/upload", baseUrl).toString();
          let avatarUrl: string;

          if (Platform.OS === "web") {
            const imageResponse = await fetch(asset.uri);
            if (!imageResponse.ok) throw new Error("Could not read selected image");
            const blob = await imageResponse.blob();
            if (blob.size === 0) throw new Error("Selected image is empty");

            const resp = await fetch(uploadUrl, {
              method: "POST",
              headers: {
                "Content-Type": mimeType,
                Authorization: `Bearer ${token}`,
              },
              body: blob,
            });
            if (!resp.ok) {
              const text = await resp.text().catch(() => "");
              throw new Error(`Upload failed (${resp.status}) ${text}`.trim());
            }
            const data = await resp.json();
            avatarUrl = data.avatarUrl;
          } else {
            const fileInfo = await FileSystem.getInfoAsync(asset.uri);
            if (!fileInfo.exists) throw new Error("Selected image not found on device");

            const uploadResult = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
              httpMethod: "POST",
              uploadType: 1, // BINARY_CONTENT
              headers: {
                "Content-Type": mimeType,
                Authorization: `Bearer ${token}`,
              },
            });
            if (uploadResult.status < 200 || uploadResult.status >= 300) {
              console.error("Upload failed", uploadResult.status, uploadResult.body);
              throw new Error(`Upload failed (${uploadResult.status})`);
            }
            const data = JSON.parse(uploadResult.body || "{}");
            avatarUrl = data.avatarUrl;
          }

          if (!avatarUrl) throw new Error("Server did not return an avatar URL");

          if (refreshUser) {
            await refreshUser();
          }
          queryClient.invalidateQueries({ queryKey: ["/api/user"] });

          if (Platform.OS === "web") {
            window.alert("Profile picture updated.");
          } else {
            Alert.alert("Success", "Your profile picture has been updated!");
          }
        } catch (error: any) {
          console.error("Error uploading avatar:", error);
          const msg = error?.message || "Failed to upload profile picture. Please try again.";
          if (Platform.OS === "web") {
            window.alert(`Upload failed: ${msg}`);
          } else {
            Alert.alert("Upload failed", msg);
          }
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "Profile",
    });
  }, [navigation]);

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing["2xl"],
        paddingBottom: insets.bottom + Spacing["3xl"],
        paddingHorizontal: Spacing["2xl"],
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={styles.profileHeader}>
        <Pressable onPress={handleChangeAvatar} disabled={isUploadingAvatar}>
          <View style={styles.avatarContainer}>
            {user?.avatarUrl && !avatarLoadFailed ? (
              <Image
                source={{ uri: user.avatarUrl }}
                style={styles.avatarImage}
                contentFit="cover"
                onError={() => {
                  console.warn("Avatar failed to load, falling back to color avatar");
                  setAvatarLoadFailed(true);
                }}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[user?.avatarIndex || 0] }]}>
                <Feather name="user" size={36} color="#fff" />
              </View>
            )}
            {isUploadingAvatar ? (
              <View style={[styles.avatarOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <View style={[styles.editBadge, { backgroundColor: theme.primary }]}>
                <Feather name="camera" size={14} color="#fff" />
              </View>
            )}
            {user?.isVip ? (
              <View style={[styles.vipBadge, { backgroundColor: theme.accent }]}>
                <Feather name="award" size={12} color="#fff" />
              </View>
            ) : null}
          </View>
        </Pressable>
        
        <Pressable 
          style={styles.nameRow} 
          onPress={handleEditName}
        >
          <ThemedText type="h3" style={styles.name}>
            {user?.displayName || "User"}
          </ThemedText>
          <View style={[styles.editNameButton, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="edit-2" size={14} color={nameChangeInfo.canChange ? theme.primary : theme.textSecondary} />
          </View>
        </Pressable>
        
        {!nameChangeInfo.canChange ? (
          <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}>
            Name change available in {nameChangeInfo.daysRemaining} day{nameChangeInfo.daysRemaining === 1 ? '' : 's'}
          </ThemedText>
        ) : null}
        
        <ThemedText type="body" style={{ color: theme.textSecondary, fontSize: 16 }} numberOfLines={1} adjustsFontSizeToFit>
          {user?.phoneNumber}
        </ThemedText>
        
        {user?.isVip ? (
          <View style={[styles.vipStatus, { backgroundColor: theme.accent + "20" }]}>
            <Feather name="award" size={16} color={theme.accent} />
            <ThemedText type="small" style={{ color: theme.accent, fontWeight: "600" }}>
              VIP Member
            </ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        {!user?.isVip ? (
          <Card
            elevation={1}
            style={styles.vipCard}
            onPress={() => navigation.navigate("VipUpgrade")}
          >
            <View style={styles.vipCardContent}>
              <View style={[styles.vipIcon, { backgroundColor: theme.accent }]}>
                <Feather name="award" size={24} color="#fff" />
              </View>
              <View style={styles.vipInfo}>
                <ThemedText type="h4">Upgrade to VIP</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Unlock Hidden Locker and exclusive features
                </ThemedText>
              </View>
              <Feather name="chevron-right" size={24} color={theme.textSecondary} />
            </View>
          </Card>
        ) : null}

        <MenuItem
          icon="lock"
          title="Hidden Locker"
          subtitle={user?.isVip ? "Access your private vault" : "VIP feature"}
          theme={theme}
          disabled={!user?.isVip}
          onPress={() => navigation.navigate("HiddenLocker")}
          iconColor="#fff"
          iconBgColor="#5856D6"
        />
        
        <MenuItem
          icon="settings"
          title="Settings"
          subtitle="App preferences and privacy"
          theme={theme}
          onPress={() => navigation.navigate("Settings")}
          iconColor="#fff"
          iconBgColor="#8E8E93"
        />
        
        <MenuItem
          icon="help-circle"
          title="Help & Support"
          subtitle="Get help with Pryvo"
          theme={theme}
          onPress={() => navigation.navigate("Support")}
          iconColor="#fff"
          iconBgColor="#007AFF"
        />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          {
            backgroundColor: pressed && !isLoggingOut ? theme.error + "20" : "transparent",
            borderColor: theme.error,
            opacity: isLoggingOut ? 0.6 : 1,
          },
        ]}
        onPress={handleLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? (
          <ActivityIndicator size="small" color={theme.error} />
        ) : (
          <Feather name="log-out" size={20} color={theme.error} />
        )}
        <ThemedText type="body" style={{ color: theme.error, fontWeight: "600" }}>
          {isLoggingOut ? "Signing Out..." : "Sign Out"}
        </ThemedText>
      </Pressable>

      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundSecondary }]}>
            <ThemedText type="h4" style={styles.modalTitle}>
              Change Display Name
            </ThemedText>
            
            <TextInput
              style={[styles.nameInput, { 
                backgroundColor: theme.backgroundDefault, 
                color: theme.text,
                borderColor: theme.border,
              }]}
              value={newDisplayName}
              onChangeText={setNewDisplayName}
              placeholder="Enter your name"
              placeholderTextColor={theme.textSecondary}
              autoFocus
              maxLength={30}
            />
            
            <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.xl }}>
              You can change your name once every 30 days
            </ThemedText>
            
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.backgroundDefault }]}
                onPress={() => setShowNameModal(false)}
                disabled={isSavingName}
              >
                <ThemedText type="body" style={{ color: theme.text }}>
                  Cancel
                </ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.modalButton, { backgroundColor: theme.primary }]}
                onPress={handleSaveName}
                disabled={isSavingName}
              >
                {isSavingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText type="body" style={{ color: "#fff", fontWeight: "600" }}>
                    Save
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAwareScrollViewCompat>
  );
}

function MenuItem({
  icon,
  title,
  subtitle,
  theme,
  disabled,
  onPress,
  iconColor,
  iconBgColor,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  theme: any;
  disabled?: boolean;
  onPress: () => void;
  iconColor?: string;
  iconBgColor?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        {
          backgroundColor: pressed && !disabled ? theme.backgroundDefault : "transparent",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBgColor || theme.backgroundDefault }]}>
        <Feather name={icon} size={20} color={iconColor || "#fff"} />
      </View>
      <View style={styles.menuContent}>
        <ThemedText type="body" style={{ fontWeight: "500" }}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {subtitle}
        </ThemedText>
      </View>
      <Feather name="chevron-right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
  },
  avatarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  editBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  vipBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  name: {
    marginBottom: Spacing.sm,
  },
  vipStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.lg,
  },
  section: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  vipCard: {
    borderWidth: 2,
    marginBottom: Spacing.lg,
  },
  vipCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  vipIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  vipInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.lg,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  menuContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  editNameButton: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  nameInput: {
    height: 52,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
});
