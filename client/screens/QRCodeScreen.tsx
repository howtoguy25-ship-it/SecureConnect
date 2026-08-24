import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Alert, Share, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import { haptics } from "@/lib/haptics";
import { Image } from "expo-image";
import { apiRequest, getApiUrl } from "@/lib/query-client";

const QR_COLORS = [
  { name: "Blue", primary: "#2563EB", secondary: "#1E40AF" },
  { name: "Purple", primary: "#7C3AED", secondary: "#5B21B6" },
  { name: "Green", primary: "#059669", secondary: "#047857" },
  { name: "Orange", primary: "#EA580C", secondary: "#C2410C" },
  { name: "Pink", primary: "#DB2777", secondary: "#BE185D" },
];

export default function QRCodeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, token } = useAuth();
  
  const [activeTab, setActiveTab] = useState<"code" | "scan">("code");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [colorIndex, setColorIndex] = useState(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentColor = QR_COLORS[colorIndex];
  const username = user?.displayName || "User";
  const shareLink = `https://secureconnect.app/user/${user?.id}`;
  const [isLoadingQR, setIsLoadingQR] = useState(false);

  useEffect(() => {
    generateQRCode();
  }, [user?.id, colorIndex, token]);

  const generateQRCode = async () => {
    if (!user?.id || !token) return;
    
    setIsLoadingQR(true);
    try {
      const url = new URL(`/api/qrcode/${user.id}`, getApiUrl());
      url.searchParams.set('color', currentColor.primary);
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch QR code');
      }
      
      const data = await response.json();
      setQrDataUrl(data.dataUrl);
    } catch (error) {
      console.error("Error generating QR code:", error);
    } finally {
      setIsLoadingQR(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(shareLink);
      haptics.success();
      Alert.alert("Copied", "Link copied to clipboard");
    } catch (error) {
      Alert.alert("Error", "Failed to copy link");
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Add me on Pryvo! My username is @${username}\n${shareLink}`,
        title: "Share my Pryvo",
      });
      haptics.light();
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  const handleChangeColor = () => {
    haptics.light();
    setColorIndex((prev) => (prev + 1) % QR_COLORS.length);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedCode || isProcessing) return;
    setScannedCode(data);
    setIsProcessing(true);
    haptics.success();
    
    if (data.startsWith("secureconnect://user/")) {
      const scannedUserId = data.replace("secureconnect://user/", "");
      
      try {
        const userResponse = await fetch(
          new URL(`/api/users/${scannedUserId}/profile`, getApiUrl()).toString(),
          {
            headers: {
              'Authorization': `Bearer ${token || ''}`,
            },
          }
        );
        
        if (!userResponse.ok) {
          const errorData = await userResponse.json();
          throw new Error(errorData.error || 'User not found');
        }
        
        const scannedUser = await userResponse.json();

        // The scan screen's own hint says "add a friend" — this used to only
        // open a chat and never actually called the real friends system
        // (POST /api/friends, the same endpoint the Add Friend flow
        // elsewhere in the app uses), so a scanned QR code never showed up
        // as a friend anywhere. Best-effort: a failure here (already
        // friends, blocked, etc.) shouldn't stop the chat from opening.
        try {
          await apiRequest('POST', '/api/friends', { friendId: scannedUserId });
        } catch (friendErr) {
          console.warn('[QR scan] friend request failed (continuing to open chat):', friendErr);
        }

        const conversationRes = await apiRequest('POST', '/api/conversations', { otherUserId: scannedUserId });
        
        if (!conversationRes.ok) {
          const errorData = await conversationRes.json();
          throw new Error(errorData.error || 'Failed to create conversation');
        }
        
        const conversationData = await conversationRes.json();
        
        haptics.success();
        
        (navigation as any).replace('Conversation', {
          conversationId: conversationData.id,
          otherUserId: scannedUserId,
          otherUserName: scannedUser.displayName || 'User',
          otherUserAvatarIndex: scannedUser.avatarIndex || 0,
        });
        
      } catch (error: any) {
        setIsProcessing(false);
        const errorMessage = error?.message || 'Failed to add user';
        Alert.alert("Error", errorMessage, [
          { text: "OK", onPress: () => setScannedCode(null) }
        ]);
      }
    } else {
      setIsProcessing(false);
      Alert.alert("Invalid Code", "This QR code is not a valid Pryvo user.", [
        { text: "OK", onPress: () => setScannedCode(null) }
      ]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()}>
          <ThemedText type="body" style={{ color: theme.primary }}>Done</ThemedText>
        </Pressable>
        
        <View style={[styles.tabContainer, { backgroundColor: theme.backgroundSecondary }]}>
          <Pressable 
            style={[styles.tab, activeTab === "code" && { backgroundColor: theme.backgroundDefault }]}
            onPress={() => setActiveTab("code")}
          >
            <ThemedText type="small" style={{ color: activeTab === "code" ? theme.text : theme.textSecondary }}>
              Code
            </ThemedText>
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "scan" && { backgroundColor: theme.backgroundDefault }]}
            onPress={() => setActiveTab("scan")}
          >
            <ThemedText type="small" style={{ color: activeTab === "scan" ? theme.text : theme.textSecondary }}>
              Scan
            </ThemedText>
          </Pressable>
        </View>
        
        <View style={{ width: 40 }} />
      </View>

      {activeTab === "code" ? (
        <View style={styles.content}>
          <View style={[styles.qrCard, { backgroundColor: currentColor.primary }]}>
            <View style={styles.qrContainer}>
              {qrDataUrl && !isLoadingQR ? (
                <Image source={{ uri: qrDataUrl }} style={styles.qrImage} contentFit="contain" />
              ) : (
                <View style={[styles.qrPlaceholder, { backgroundColor: "#fff" }]}>
                  <ActivityIndicator size="large" color={currentColor.primary} />
                </View>
              )}
            </View>
            
            <View style={styles.usernameRow}>
              <Feather name="lock" size={14} color="#fff" />
              <ThemedText type="body" style={styles.username}>
                {username}
              </ThemedText>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.actionButton, { backgroundColor: theme.backgroundDefault }]} onPress={handleCopyLink}>
              <Feather name="link" size={22} color={theme.text} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>link</ThemedText>
            </Pressable>
            
            <Pressable style={[styles.actionButton, { backgroundColor: theme.backgroundDefault }]} onPress={handleShare}>
              <Feather name="share" size={22} color={theme.text} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>share</ThemedText>
            </Pressable>
            
            <Pressable style={[styles.actionButton, { backgroundColor: theme.backgroundDefault }]} onPress={handleChangeColor}>
              <Feather name="droplet" size={22} color={theme.text} />
              <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>color</ThemedText>
            </Pressable>
          </View>

          <ThemedText type="small" style={[styles.disclaimer, { color: theme.textSecondary }]}>
            Only share your QR code and link with people you trust. When shared others will be able to see your username and start a chat with you.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.scanContent}>
          {permission?.granted ? (
            <View style={styles.cameraContainer}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={scannedCode ? undefined : handleBarcodeScanned}
              />
              <View style={styles.scanOverlay}>
                {isProcessing ? (
                  <View style={[styles.processingContainer, { backgroundColor: theme.backgroundDefault }]}>
                    <ActivityIndicator size="large" color={theme.primary} />
                    <ThemedText type="body" style={{ color: theme.text, marginTop: Spacing.md }}>
                      Adding friend...
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.scanFrame}>
                    <View style={[styles.cornerTL, { borderColor: theme.primary }]} />
                    <View style={[styles.cornerTR, { borderColor: theme.primary }]} />
                    <View style={[styles.cornerBL, { borderColor: theme.primary }]} />
                    <View style={[styles.cornerBR, { borderColor: theme.primary }]} />
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.permissionContainer}>
              <Feather name="camera-off" size={48} color={theme.textSecondary} />
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.lg, textAlign: "center" }}>
                Camera permission is required to scan QR codes
              </ThemedText>
              <Pressable 
                style={[styles.permissionButton, { backgroundColor: theme.primary }]}
                onPress={requestPermission}
              >
                <ThemedText type="body" style={{ color: "#fff" }}>Enable Camera</ThemedText>
              </Pressable>
            </View>
          )}
          
          <ThemedText type="small" style={[styles.scanHint, { color: theme.textSecondary }]}>
            Point your camera at a Pryvo QR code to add a friend
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 2,
  },
  tab: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing["2xl"],
  },
  qrCard: {
    width: "100%",
    maxWidth: 280,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
  },
  qrContainer: {
    backgroundColor: "#fff",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  qrPlaceholder: {
    width: 180,
    height: 180,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.md,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    gap: Spacing.xs,
  },
  username: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  actions: {
    flexDirection: "row",
    marginTop: Spacing["2xl"],
    gap: Spacing.lg,
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  disclaimer: {
    textAlign: "center",
    marginTop: Spacing["2xl"],
    paddingHorizontal: Spacing.lg,
    lineHeight: 18,
  },
  scanContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  cameraContainer: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginTop: Spacing.lg,
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 220,
    height: 220,
    position: "relative",
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  permissionButton: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  scanHint: {
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  processingContainer: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
});
