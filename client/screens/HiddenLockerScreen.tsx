import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { View, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator, Modal, ScrollView, useWindowDimensions, Alert, Platform, AppState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight, HeaderButton } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Image } from "expo-image";
import * as ScreenCapture from "expo-screen-capture";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { getStoredToken } from "@/lib/auth";
import {
  deriveLockerKey,
  encryptLockerItem,
  decryptLockerItem,
  generateSalt,
  zeroKey,
  type LockerPlaintext,
} from "@/lib/lockerCrypto";

interface RawLockerRow {
  id: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  ciphertext: string | null;
  nonce: string | null;
  encryptedV2: boolean;
  createdAt: string;
}

interface DisplayItem {
  id: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  encryptedV2: boolean;
  createdAt: string;
  decryptError?: boolean;
}

// Minimum strength enforced by server; mirror here so the UI can guide users.
const MIN_PIN_LEN = 6;

export default function HiddenLockerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Master key lives only in this ref, never in AsyncStorage / SecureStore.
  // It's wiped on lock, on background, and on unmount.
  const masterKeyRef = useRef<Uint8Array | null>(null);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState<DisplayItem | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);

  const wipeMasterKey = useCallback(() => {
    if (masterKeyRef.current) {
      zeroKey(masterKeyRef.current);
      masterKeyRef.current = null;
    }
  }, []);

  const handleLockAndExit = useCallback(() => {
    wipeMasterKey();
    setIsUnlocked(false);
    setPin("");
    setItems([]);
    navigation.goBack();
  }, [navigation, wipeMasterKey]);

  // Block screenshots + screen recording only once the locker is actually
  // unlocked and showing real content.  On iOS this prevents the system
  // screenshot bitmap; on Android it sets FLAG_SECURE, which also hides the
  // window from the app-switcher preview. The PIN-entry front page has
  // nothing sensitive on it, so it stays screenshot-able like the rest of
  // the app.
  useEffect(() => {
    if (!isUnlocked) {
      ScreenCapture.allowScreenCaptureAsync("hidden-locker").catch(() => {});
      return;
    }
    ScreenCapture.preventScreenCaptureAsync("hidden-locker").catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync("hidden-locker").catch(() => {});
    };
  }, [isUnlocked]);

  // Auto-lock on background.  If the user backgrounds the app, we drop the
  // key — they'll need to re-enter the PIN.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" && isUnlocked) {
        wipeMasterKey();
        setIsUnlocked(false);
        setItems([]);
      }
    });
    return () => sub.remove();
  }, [isUnlocked, wipeMasterKey]);

  // Wipe key on unmount as a last line of defense.
  useEffect(() => () => wipeMasterKey(), [wipeMasterKey]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: !isUnlocked,
      headerLeft: isUnlocked ? () => (
        <HeaderButton onPress={handleLockAndExit}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="lock" size={18} color={theme.primary} />
            <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>Lock</ThemedText>
          </View>
        </HeaderButton>
      ) : undefined,
    });
  }, [navigation, isUnlocked, handleLockAndExit, theme.primary]);

  const handleItemPress = (item: DisplayItem) => {
    setSelectedItem(item);
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setSelectedItem(null);
  };

  useEffect(() => {
    checkPin();
  }, []);

  const checkPin = async () => {
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/locker/has-pin', baseUrl), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setHasPin(data.hasPin);
        if (!data.hasPin) {
          setIsSettingPin(true);
        }
      }
    } catch (e) {
      console.error('Error checking pin:', e);
    }
  };

  const handleSetPin = async () => {
    if (pin.length < MIN_PIN_LEN) {
      setError(`PIN must be at least ${MIN_PIN_LEN} digits`);
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const salt = generateSalt();
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/locker/pin', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pin, salt }),
      });
      if (response.ok) {
        // Derive the master key from the just-set PIN + new salt so we can
        // unlock immediately without an extra verify round-trip.
        const key = await deriveLockerKey(pin, salt);
        masterKeyRef.current = key;
        setIsUnlocked(true);
        setHasPin(true);
        setIsSettingPin(false);
        await fetchItems();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Failed to set PIN. Please try again.");
      }
    } catch {
      setError("Failed to set PIN");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyPin = async () => {
    if (pin.length < MIN_PIN_LEN) {
      setError(`Enter your ${MIN_PIN_LEN}+ digit PIN`);
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      const response = await fetch(new URL('/api/locker/verify-pin', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.valid && data.salt) {
        const key = await deriveLockerKey(pin, data.salt);
        masterKeyRef.current = key;
        setIsUnlocked(true);
        setLockedUntil(null);
        await fetchItems();
      } else if (response.status === 429 && data.wiped) {
        setError("Too many failed attempts — locker was wiped.");
        setHasPin(false);
        setIsSettingPin(true);
        setPin("");
      } else if (response.status === 429 && data.lockedUntil) {
        setLockedUntil(new Date(data.lockedUntil));
        setError("Locker temporarily locked. Try again later.");
        setPin("");
      } else {
        const left = data.attempts ? ` (${data.attempts}/20)` : "";
        setError(`Incorrect PIN${left}`);
        setPin("");
      }
    } catch {
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
      if (!response.ok) return;
      const rows: RawLockerRow[] = await response.json();
      const key = masterKeyRef.current;
      const decoded: DisplayItem[] = rows.map((row) => {
        if (row.encryptedV2 && row.ciphertext && row.nonce) {
          if (!key) {
            return { id: row.id, type: row.type, content: "[locked]", mediaUrl: null,
              encryptedV2: true, createdAt: row.createdAt, decryptError: true };
          }
          try {
            const pt: LockerPlaintext = decryptLockerItem(
              { ciphertext: row.ciphertext, nonce: row.nonce },
              key,
            );
            return {
              id: row.id,
              type: pt.type || row.type,
              content: pt.content,
              mediaUrl: pt.mediaUrl,
              encryptedV2: true,
              createdAt: row.createdAt,
            };
          } catch {
            return { id: row.id, type: row.type, content: "[unable to decrypt]",
              mediaUrl: null, encryptedV2: true, createdAt: row.createdAt, decryptError: true };
          }
        }
        // Legacy plaintext row
        return {
          id: row.id,
          type: row.type,
          content: row.content,
          mediaUrl: row.mediaUrl,
          encryptedV2: false,
          createdAt: row.createdAt,
        };
      });
      setItems(decoded);
      // Opportunistically migrate any remaining legacy plaintext items in
      // the background.  This is best-effort; failures are silent and the
      // item stays legacy until next unlock.
      void migrateLegacyItems(rows, key);
    } catch (e) {
      console.error('Error fetching locker items:', e);
    }
  };

  const migrateLegacyItems = async (rows: RawLockerRow[], key: Uint8Array | null) => {
    if (!key) return;
    const legacy = rows.filter((r) => !r.encryptedV2);
    if (legacy.length === 0) return;
    const token = await getStoredToken();
    const baseUrl = getApiUrl();
    for (const row of legacy) {
      try {
        const { ciphertext, nonce } = encryptLockerItem({
          type: row.type,
          content: row.content,
          mediaUrl: row.mediaUrl,
          messageId: null,
        }, key);
        await fetch(new URL(`/api/locker/${row.id}/migrate`, baseUrl), {
          method: "POST",
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ ciphertext, nonce }),
        });
      } catch {
        // Silent — user can still see and use the item; we'll retry next unlock.
      }
    }
  };

  const handleDeleteItem = async (id: string) => {
    const doDelete = async () => {
      try {
        const token = await getStoredToken();
        const baseUrl = getApiUrl();
        const res = await fetch(new URL(`/api/locker/${id}`, baseUrl), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Server error");
        setItems((prev) => prev.filter((item) => item.id !== id));
        setIsModalVisible(false);
        setSelectedItem(null);
      } catch {
        if (Platform.OS === "web") window.alert("Failed to delete item. Please try again.");
        else Alert.alert("Error", "Failed to delete item. Please try again.");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Remove this item from your locker? This cannot be undone.")) await doDelete();
    } else {
      Alert.alert("Delete Item", "Remove this item from your locker? This cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleChangePin = async () => {
    if (currentPin.length < 4) { setError("Enter your current PIN"); return; }
    if (newPin.length < MIN_PIN_LEN) { setError(`New PIN must be at least ${MIN_PIN_LEN} digits`); return; }
    if (newPin !== confirmNewPin) { setError("New PINs do not match"); return; }
    setIsLoading(true);
    setError("");
    try {
      const newSalt = generateSalt();
      const token = await getStoredToken();
      const baseUrl = getApiUrl();
      // 1) Re-encrypt every v2 item under the new key BEFORE the PIN flip,
      //    so a crash mid-rotation leaves all items readable under the OLD
      //    key (which is still active until step 2 succeeds).
      const newKey = await deriveLockerKey(newPin, newSalt);
      const oldKey = masterKeyRef.current;
      if (oldKey) {
        const rowsRes = await fetch(new URL('/api/locker', baseUrl), {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (rowsRes.ok) {
          const rows: RawLockerRow[] = await rowsRes.json();
          for (const row of rows) {
            if (!row.encryptedV2 || !row.ciphertext || !row.nonce) continue;
            try {
              const pt = decryptLockerItem({ ciphertext: row.ciphertext, nonce: row.nonce }, oldKey);
              const re = encryptLockerItem(pt, newKey);
              await fetch(new URL(`/api/locker/${row.id}/migrate`, baseUrl), {
                method: "POST",
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(re),
              });
            } catch {}
          }
        }
      }
      // 2) Flip the PIN + salt on the server.
      const response = await fetch(new URL('/api/locker/change-pin', baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ currentPin, newPin, salt: newSalt }),
      });
      if (response.ok) {
        // Adopt the new key in memory.
        if (oldKey) zeroKey(oldKey);
        masterKeyRef.current = newKey;
        setIsChangingPin(false);
        setCurrentPin(""); setNewPin(""); setConfirmNewPin("");
        await fetchItems();
        if (Platform.OS !== "web") Alert.alert("Success", "PIN changed successfully");
      } else {
        zeroKey(newKey);
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Failed to change PIN");
      }
    } catch {
      setError("Failed to change PIN");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetLocker = async () => {
    const doReset = async () => {
      setIsLoading(true);
      try {
        const token = await getStoredToken();
        const baseUrl = getApiUrl();
        const response = await fetch(new URL('/api/locker/reset', baseUrl), {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          wipeMasterKey();
          setItems([]);
          setIsUnlocked(false);
          setHasPin(false);
          setPin("");
          setIsSettingPin(true);
        } else {
          if (Platform.OS === "web") window.alert("Failed to reset locker. Please try again.");
          else Alert.alert("Error", "Failed to reset locker. Please try again.");
        }
      } catch {
        if (Platform.OS === "web") window.alert("Failed to reset locker. Please try again.");
        else Alert.alert("Error", "Failed to reset locker. Please try again.");
      } finally { setIsLoading(false); }
    };
    if (Platform.OS === "web") {
      if (window.confirm("This will permanently delete all items in your locker and remove your PIN. This cannot be undone.")) await doReset();
    } else {
      Alert.alert(
        "Reset Locker",
        "This will permanently delete all items in your locker and remove your PIN. You will need to create a new PIN to access it again. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Reset Everything", style: "destructive", onPress: doReset },
        ]
      );
    }
  };

  const renderPinInput = () => (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.pinContent,
        { paddingTop: headerHeight + Spacing["4xl"], paddingBottom: insets.bottom + Spacing.xl },
      ]}
    >
      <View style={[styles.lockIcon, { backgroundColor: theme.accent }]}>
        <Feather name="lock" size={48} color="#fff" />
      </View>
      <ThemedText type="h2" style={styles.title}>
        {isSettingPin ? "Set Your PIN" : "Enter PIN"}
      </ThemedText>
      <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
        {isSettingPin
          ? `Create a ${MIN_PIN_LEN}+ digit PIN. Your locker is encrypted with this PIN — we cannot recover it for you.`
          : `Enter your PIN to unlock`}
      </ThemedText>
      <TextInput
        style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
        placeholder={`${MIN_PIN_LEN}+ digit PIN`}
        placeholderTextColor={theme.textSecondary}
        value={pin}
        onChangeText={(text) => { setPin(text.replace(/\D/g, "").slice(0, 32)); setError(""); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={32}
        autoFocus
        editable={!lockedUntil || lockedUntil.getTime() <= Date.now()}
      />
      {isSettingPin ? (
        <TextInput
          style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
          placeholder="Confirm PIN"
          placeholderTextColor={theme.textSecondary}
          value={confirmPin}
          onChangeText={(text) => { setConfirmPin(text.replace(/\D/g, "").slice(0, 32)); setError(""); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={32}
        />
      ) : null}
      {error ? <ThemedText type="small" style={[styles.error, { color: theme.error }]}>{error}</ThemedText> : null}
      <Button
        onPress={isSettingPin ? handleSetPin : handleVerifyPin}
        disabled={isLoading || pin.length < MIN_PIN_LEN || (isSettingPin && confirmPin.length < MIN_PIN_LEN)}
        style={styles.button}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : (isSettingPin ? "Set PIN" : "Unlock")}
      </Button>
      {!isSettingPin ? (
        // The locker's key is derived from the PIN itself — there is no
        // server-side recovery possible, so "forgot PIN" can only mean
        // "wipe and start over" (handleResetLocker already implements this,
        // with a clear destructive-confirmation dialog; it just wasn't
        // reachable from this locked-out screen before).
        <Pressable onPress={handleResetLocker} disabled={isLoading} style={styles.forgotPinButton}>
          <ThemedText type="small" style={{ color: theme.error, textAlign: "center" }}>
            Forgot PIN? Reset Locker
          </ThemedText>
        </Pressable>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );

  const renderItem = ({ item }: { item: DisplayItem }) => (
    <View style={[styles.itemCard, { backgroundColor: theme.backgroundDefault }]}>
      <Pressable style={({ pressed }) => [styles.itemPressable, pressed && { opacity: 0.7 }]} onPress={() => handleItemPress(item)}>
        <View style={styles.itemInner}>
          <View style={styles.itemIcon}>
            <Feather name={item.type === "message" ? "message-circle" : "image"} size={24} color={theme.textSecondary} />
          </View>
          <View style={styles.itemContent}>
            <ThemedText type="body" numberOfLines={2}>
              {item.content || "[Media]"}
            </ThemedText>
            <View style={{ flexDirection: "row", gap: Spacing.xs, alignItems: "center" }}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {new Date(item.createdAt).toLocaleDateString()}
              </ThemedText>
              {item.encryptedV2 ? (
                <Feather name="shield" size={11} color={theme.primary} />
              ) : (
                <ThemedText type="small" style={{ color: theme.warning ?? "#f59e0b" }}>legacy</ThemedText>
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} style={{ marginLeft: Spacing.sm }} />
        </View>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.5 : 1 }]} onPress={() => handleDeleteItem(item.id)}>
        <Feather name="trash-2" size={20} color={theme.error} />
      </Pressable>
    </View>
  );

  const getDynamicStyles = () => StyleSheet.create({
    modalContent: {
      width: "100%",
      maxWidth: screenWidth - Spacing["2xl"] * 2,
      maxHeight: screenHeight * 0.8,
      borderRadius: BorderRadius.lg,
      overflow: "hidden",
    },
    modalImage: {
      width: "100%",
      height: screenHeight * 0.4,
      borderRadius: BorderRadius.sm,
      marginBottom: Spacing.md,
    },
  });

  const dynamicStyles = getDynamicStyles();

  const renderItemModal = () => {
    if (!selectedItem) return null;
    const isMedia = selectedItem.type === "media" || selectedItem.type === "image" || !!selectedItem.mediaUrl;
    return (
      <Modal visible={isModalVisible} animationType="fade" transparent onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={[dynamicStyles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">{isMedia ? "Hidden Media" : "Hidden Message"}</ThemedText>
              <Pressable style={styles.closeButton} onPress={closeModal}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator={false}>
              {isMedia && selectedItem.mediaUrl ? (
                <Image source={{ uri: selectedItem.mediaUrl }} style={dynamicStyles.modalImage} contentFit="contain" />
              ) : null}
              {selectedItem.content ? (
                <ThemedText type="body" style={styles.modalText}>{selectedItem.content}</ThemedText>
              ) : null}
              <ThemedText type="small" style={[styles.modalDate, { color: theme.textSecondary }]}>
                Added on {new Date(selectedItem.createdAt).toLocaleDateString()}
              </ThemedText>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalButton, { backgroundColor: theme.backgroundRoot }]} onPress={closeModal}>
                <ThemedText type="body">Close</ThemedText>
              </Pressable>
              <Pressable style={[styles.modalButton, { backgroundColor: theme.error }]} onPress={() => handleDeleteItem(selectedItem.id)}>
                <ThemedText type="body" style={{ color: "#fff" }}>Delete</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  if (hasPin === null) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }
  if (!isUnlocked) return renderPinInput();

  if (isChangingPin) {
    return (
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[styles.pinContent, { paddingTop: headerHeight + Spacing["4xl"], paddingBottom: insets.bottom + Spacing.xl }]}
      >
        <View style={[styles.lockIcon, { backgroundColor: theme.primary }]}>
          <Feather name="edit-2" size={40} color="#fff" />
        </View>
        <ThemedText type="h2" style={styles.title}>Change PIN</ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          New PIN must be at least {MIN_PIN_LEN} digits. All locker items will be re-encrypted under the new PIN.
        </ThemedText>
        <TextInput
          style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
          placeholder="Current PIN"
          placeholderTextColor={theme.textSecondary}
          value={currentPin}
          onChangeText={(t) => { setCurrentPin(t.replace(/\D/g, "").slice(0, 32)); setError(""); }}
          keyboardType="number-pad" secureTextEntry maxLength={32} autoFocus
        />
        <TextInput
          style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
          placeholder={`New PIN (${MIN_PIN_LEN}+ digits)`}
          placeholderTextColor={theme.textSecondary}
          value={newPin}
          onChangeText={(t) => { setNewPin(t.replace(/\D/g, "").slice(0, 32)); setError(""); }}
          keyboardType="number-pad" secureTextEntry maxLength={32}
        />
        <TextInput
          style={[styles.pinInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: error ? theme.error : "transparent" }]}
          placeholder="Confirm New PIN"
          placeholderTextColor={theme.textSecondary}
          value={confirmNewPin}
          onChangeText={(t) => { setConfirmNewPin(t.replace(/\D/g, "").slice(0, 32)); setError(""); }}
          keyboardType="number-pad" secureTextEntry maxLength={32}
        />
        {error ? <ThemedText type="small" style={[styles.error, { color: theme.error }]}>{error}</ThemedText> : null}
        <Button
          onPress={handleChangePin}
          disabled={isLoading || currentPin.length < 4 || newPin.length < MIN_PIN_LEN || confirmNewPin.length < MIN_PIN_LEN}
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
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.actionBar}>
            <Pressable
              style={[styles.actionBarBtn, { backgroundColor: `${theme.primary}26`, borderColor: theme.primary }]}
              onPress={() => { setIsChangingPin(true); setError(""); }}
            >
              <Feather name="edit-2" size={20} color={theme.primary} />
              <ThemedText type="body" style={{ color: theme.primary, fontWeight: '700' }}>Change PIN</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionBarBtn, { backgroundColor: `${theme.error}26`, borderColor: theme.error }]}
              onPress={handleResetLocker}
            >
              <Feather name="rotate-ccw" size={20} color={theme.error} />
              <ThemedText type="body" style={{ color: theme.error, fontWeight: '700' }}>Reset Locker</ThemedText>
            </Pressable>
          </View>
        }
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="lock" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary }}>Your locker is empty</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
              Long-press on messages or media in conversations to add them here
            </ThemedText>
          </View>
        }
      />
      {renderItemModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  pinContent: { flexGrow: 1, paddingHorizontal: Spacing["2xl"], alignItems: "center" },
  lockIcon: { width: 100, height: 100, borderRadius: BorderRadius.full, justifyContent: "center", alignItems: "center", marginBottom: Spacing.xl },
  title: { textAlign: "center", marginBottom: Spacing.sm },
  subtitle: { textAlign: "center", marginBottom: Spacing["3xl"], paddingHorizontal: Spacing.lg },
  pinInput: { width: "100%", height: Spacing.inputHeight, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.sm, fontSize: 24, fontWeight: "600", textAlign: "center", letterSpacing: 8, borderWidth: 2, marginBottom: Spacing.lg },
  error: { textAlign: "center", marginBottom: Spacing.md },
  button: { width: "100%" },
  forgotPinButton: { width: "100%", marginTop: Spacing.lg, padding: Spacing.sm },
  actionBar: { flexDirection: "row", gap: Spacing.md, marginBottom: Spacing.lg },
  actionBarBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1.5 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: Spacing["5xl"], paddingHorizontal: Spacing["2xl"], gap: Spacing.md },
  itemCard: { flexDirection: "row", alignItems: "center", borderRadius: BorderRadius.sm, marginBottom: Spacing.sm },
  itemPressable: { flex: 1 },
  itemInner: { flexDirection: "row", alignItems: "center", padding: Spacing.md, gap: Spacing.md },
  itemIcon: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  itemContent: { flex: 1 },
  chevronIcon: { marginLeft: Spacing.sm },
  deleteButton: { padding: Spacing.md, justifyContent: "center", alignItems: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.8)", justifyContent: "center", alignItems: "center", padding: Spacing.lg },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: "rgba(255, 255, 255, 0.1)" },
  closeButton: { padding: Spacing.sm },
  modalBody: { flex: 1 },
  modalBodyContent: { padding: Spacing.lg },
  modalText: { marginBottom: Spacing.md },
  modalDate: { marginTop: Spacing.sm },
  modalActions: { flexDirection: "row", gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: "rgba(255, 255, 255, 0.1)" },
  modalButton: { flex: 1, paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.sm, alignItems: "center", justifyContent: "center" },
});
