import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, RefreshControl, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import { Image } from "expo-image";

interface LockerItem {
  id: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

export default function LockerTabScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [items, setItems] = useState<LockerItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");

  useFocusEffect(
    useCallback(() => {
      if (!isUnlocked) {
        checkHasPin();
      }
    }, [isUnlocked])
  );

  const checkHasPin = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/locker/has-pin', baseUrl), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setHasPin(data.hasPin);
        if (!data.hasPin) {
          setIsSettingPin(true);
        }
      }
    } catch (error) {
      console.error('Error checking pin:', error);
    }
  };

  const handleSetPin = async () => {
    if (pin.length !== 4) {
      setError("PIN must be 4 digits");
      return;
    }
    
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetchWithTimeout(new URL('/api/locker/pin', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ pin }),
      });
      
      if (response.ok) {
        setIsUnlocked(true);
        setHasPin(true);
        setIsSettingPin(false);
        await fetchItems();
      } else {
        setError("Failed to set PIN. Please try again.");
      }
    } catch (error) {
      setError("Failed to set PIN");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPin = async () => {
    if (pin.length !== 4) {
      setError("Please enter your 4-digit PIN");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetchWithTimeout(new URL('/api/locker/verify-pin', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ pin }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          setIsUnlocked(true);
          await fetchItems();
        } else {
          setError("Incorrect PIN");
          setPin("");
        }
      }
    } catch (error) {
      setError("Failed to verify PIN");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/locker', baseUrl), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Error fetching locker items:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchItems();
    setIsRefreshing(false);
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      await fetch(new URL(`/api/locker/${id}`, baseUrl), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const handleChangePin = async () => {
    if (currentPin.length !== 4) { setError("Enter your current 4-digit PIN"); return; }
    if (newPin.length !== 4) { setError("New PIN must be 4 digits"); return; }
    if (newPin !== confirmNewPin) { setError("New PINs do not match"); return; }
    setIsLoading(true);
    setError("");
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/locker/change-pin', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (response.ok) {
        setIsChangingPin(false);
        setCurrentPin(""); setNewPin(""); setConfirmNewPin("");
        Alert.alert("Success", "PIN changed successfully");
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Failed to change PIN");
      }
    } catch {
      setError("Failed to change PIN");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetLocker = () => {
    Alert.alert(
      "Reset Locker",
      "This will permanently delete all items in your locker and remove your PIN. You will need to create a new PIN to access it again. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Everything",
          style: "destructive",
          onPress: async () => {
            setIsLoading(true);
            try {
              const token = await getStoredToken();
              const baseUrl = getApiUrl();
              const response = await fetch(new URL('/api/locker/reset', baseUrl), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              if (response.ok) {
                setItems([]);
                setIsUnlocked(false);
                setHasPin(false);
                setPin("");
                setIsSettingPin(true);
              } else {
                Alert.alert("Error", "Failed to reset locker. Please try again.");
              }
            } catch {
              Alert.alert("Error", "Failed to reset locker. Please try again.");
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderPinInput = () => (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.pinContent,
        {
          paddingTop: insets.top + Spacing["4xl"],
          paddingBottom: insets.bottom + Spacing.xl,
        },
      ]}
    >
      <View style={[styles.lockIcon, { backgroundColor: theme.accent }]}>
        <Feather name="lock" size={48} color="#fff" />
      </View>
      
      <ThemedText type="h2" style={styles.title}>
        {isSettingPin ? "Create Your PIN" : "Enter PIN"}
      </ThemedText>
      
      <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
        {isSettingPin
          ? "Create a 4-digit PIN to protect your private locker. Keep this safe!"
          : "Enter your 4-digit PIN to access your hidden items"
        }
      </ThemedText>

      <TextInput
        style={[
          styles.pinInput,
          {
            backgroundColor: theme.backgroundDefault,
            color: theme.text,
            borderColor: error ? theme.error : "transparent",
          },
        ]}
        placeholder="Enter PIN"
        placeholderTextColor={theme.textSecondary}
        value={pin}
        onChangeText={(text) => {
          setPin(text.replace(/\D/g, "").slice(0, 4));
          setError("");
        }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        autoFocus
      />

      {isSettingPin ? (
        <TextInput
          style={[
            styles.pinInput,
            {
              backgroundColor: theme.backgroundDefault,
              color: theme.text,
              borderColor: error ? theme.error : "transparent",
            },
          ]}
          placeholder="Confirm PIN"
          placeholderTextColor={theme.textSecondary}
          value={confirmPin}
          onChangeText={(text) => {
            setConfirmPin(text.replace(/\D/g, "").slice(0, 4));
            setError("");
          }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
        />
      ) : null}

      {error ? (
        <ThemedText type="small" style={[styles.error, { color: theme.error }]}>
          {error}
        </ThemedText>
      ) : null}

      <Button
        onPress={isSettingPin ? handleSetPin : handleVerifyPin}
        disabled={isLoading || pin.length !== 4 || (isSettingPin && confirmPin.length !== 4)}
        style={styles.button}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : (isSettingPin ? "Create PIN" : "Unlock")}
      </Button>
    </KeyboardAwareScrollViewCompat>
  );

  const renderItem = ({ item }: { item: LockerItem }) => (
    <View style={[styles.itemCard, { backgroundColor: theme.backgroundDefault }]}>
      {item.mediaUrl ? (
        <Image
          source={{ uri: item.mediaUrl }}
          style={styles.itemThumbnail}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.itemIcon, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather
            name={item.type === "message" ? "message-circle" : "image"}
            size={24}
            color={theme.textSecondary}
          />
        </View>
      )}
      <View style={styles.itemContent}>
        <ThemedText type="body" numberOfLines={2}>
          {item.content || (item.type === "photo" ? "[Photo]" : item.type === "video" ? "[Video]" : "[Media]")}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {new Date(item.createdAt).toLocaleDateString()}
        </ThemedText>
      </View>
      <Pressable
        style={styles.deleteButton}
        onPress={() => handleDeleteItem(item.id)}
      >
        <Feather name="trash-2" size={20} color={theme.error} />
      </Pressable>
    </View>
  );

  if (hasPin === null) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!isUnlocked) {
    return renderPinInput();
  }

  if (isChangingPin) {
    return (
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[styles.pinContent, { paddingTop: insets.top + Spacing["4xl"], paddingBottom: insets.bottom + Spacing.xl }]}
      >
        <View style={[styles.lockIcon, { backgroundColor: theme.primary }]}>
          <Feather name="edit-2" size={40} color="#fff" />
        </View>
        <ThemedText type="h2" style={styles.title}>Change PIN</ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          Enter your current PIN, then choose a new one
        </ThemedText>
        <TextInput
          style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
          placeholder="Current PIN"
          placeholderTextColor={theme.textSecondary}
          value={currentPin}
          onChangeText={(t) => { setCurrentPin(t.replace(/\D/g, "").slice(0, 4)); setError(""); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          autoFocus
        />
        <TextInput
          style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
          placeholder="New PIN"
          placeholderTextColor={theme.textSecondary}
          value={newPin}
          onChangeText={(t) => { setNewPin(t.replace(/\D/g, "").slice(0, 4)); setError(""); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
        />
        <TextInput
          style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
          placeholder="Confirm New PIN"
          placeholderTextColor={theme.textSecondary}
          value={confirmNewPin}
          onChangeText={(t) => { setConfirmNewPin(t.replace(/\D/g, "").slice(0, 4)); setError(""); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
        />
        {error ? <ThemedText type="small" style={[styles.error, { color: theme.error }]}>{error}</ThemedText> : null}
        <Button
          onPress={handleChangePin}
          disabled={isLoading || currentPin.length !== 4 || newPin.length !== 4 || confirmNewPin.length !== 4}
          style={styles.button}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : "Update PIN"}
        </Button>
        <Pressable onPress={() => { setIsChangingPin(false); setCurrentPin(""); setNewPin(""); setConfirmNewPin(""); setError(""); }} style={{ marginTop: Spacing.lg }}>
          <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>Cancel</ThemedText>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.lg }]}>
        <View style={styles.headerIcon}>
          <Feather name="lock" size={24} color={theme.accent} />
        </View>
        <ThemedText type="h3">Hidden Locker</ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          VIP Only
        </ThemedText>
        <View style={styles.headerActions}>
          <Pressable style={[styles.headerActionBtn, { backgroundColor: theme.backgroundDefault }]} onPress={() => { setIsChangingPin(true); setError(""); }}>
            <Feather name="edit-2" size={14} color={theme.primary} />
            <ThemedText type="small" style={{ color: theme.primary }}>Change PIN</ThemedText>
          </Pressable>
          <Pressable style={[styles.headerActionBtn, { backgroundColor: theme.backgroundDefault }]} onPress={handleResetLocker}>
            <Feather name="rotate-ccw" size={14} color={theme.error} />
            <ThemedText type="small" style={{ color: theme.error }}>Reset Locker</ThemedText>
          </Pressable>
        </View>
      </View>
      
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="lock" size={48} color={theme.textSecondary} />
            </View>
            <ThemedText type="h3" style={{ textAlign: "center" }}>
              Your Locker is Empty
            </ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
              Long-press on messages or photos in conversations to hide them here
            </ThemedText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    paddingBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  headerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  pinContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing["2xl"],
    alignItems: "center",
  },
  lockIcon: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing["3xl"],
    paddingHorizontal: Spacing.lg,
  },
  pinInput: {
    width: "100%",
    height: Spacing.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 8,
    borderWidth: 2,
    marginBottom: Spacing.lg,
  },
  error: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  button: {
    width: "100%",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: Spacing["5xl"],
    paddingHorizontal: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  itemIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  itemThumbnail: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.xs,
  },
  itemContent: {
    flex: 1,
  },
  deleteButton: {
    padding: Spacing.sm,
  },
});
