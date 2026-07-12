import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, pressedOpacity } from "@/theme/tokens";

interface Props {
  onClose: () => void;
}

// The on-device detection pipeline (TensorFlow.js + a now-unmaintained camera bridge) is
// temporarily disabled after the Expo SDK 57 upgrade -- that library never updated past
// expo-camera/expo-gl v13 and can't compile under the Xcode version Apple now requires.
// The trained model and detection logic are preserved at legacy/ai-vehicle-detection-tfjs/
// (see the README there) pending a rewrite onto a currently-maintained native pipeline. This
// screen keeps its real camera preview and controls so the entry point/UX isn't silently
// removed -- it just doesn't run detection yet.
export function VehicleDetectionScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");

  const toggleFacing = useCallback(() => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  }, []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          TrackLine needs camera access to detect vehicles in view.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant camera access</Text>
        </Pressable>
        <Pressable onPress={onClose}>
          <Text style={styles.closeLink}>Close</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing={facing} />

      <View style={[styles.banner, { top: insets.top + spacing.md }]}>
        <Text style={styles.bannerText}>
          AI Vehicle Detection is temporarily unavailable while we upgrade its camera
          pipeline to a currently-maintained library. Everything else in TrackLine is
          unaffected — check back soon.
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.switchButton,
          { bottom: insets.bottom + spacing.xl },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={toggleFacing}
        accessibilityLabel="Switch camera"
      >
        <Ionicons name="camera-reverse" size={22} color={colors.text} />
        <Text style={styles.switchButtonText}>Switch camera</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.closeButton,
          { bottom: insets.bottom + spacing.xl },
          pressed && { opacity: pressedOpacity },
        ]}
        onPress={onClose}
      >
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permissionText: {
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  closeLink: {
    color: "#9CA3AF",
    marginTop: 8,
  },
  banner: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
  },
  bannerText: {
    color: "#fff",
    fontSize: 12,
    flex: 1,
  },
  switchButton: {
    position: "absolute",
    right: spacing.xl,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm - 2,
  },
  switchButtonText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  closeButton: {
    position: "absolute",
    left: spacing.xl,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  closeButtonText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
});
