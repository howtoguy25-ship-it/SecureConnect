import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import { refreshLiveCameraImageUrl, type LiveTrafficCamera } from "@/services/liveTrafficCameras";

interface Props {
  camera: LiveTrafficCamera | null;
  onClose: () => void;
  onSheetChange?: (index: number) => void;
}

// TfNSW republishes each camera's frame roughly every 60s -- refreshing more often than that
// would just re-fetch the same still image over and over. Mirrors web's LiveCamerasPanel.
const IMAGE_REFRESH_MS = 60_000;

export const LiveCameraSheet = forwardRef<BottomSheet, Props>(function LiveCameraSheet(
  { camera, onClose, onSheetChange },
  ref
) {
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => ["46%"], []);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!camera) return;
    setSrc(refreshLiveCameraImageUrl(camera.imageUrl));
    const id = setInterval(() => {
      setSrc(refreshLiveCameraImageUrl(camera.imageUrl));
    }, IMAGE_REFRESH_MS);
    return () => clearInterval(id);
  }, [camera?.imageUrl]);

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onChange={onSheetChange}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      <BottomSheetView style={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}>
        {camera && src && (
          <>
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Ionicons name="videocam" size={20} color={colors.text} />
                <Text style={styles.title}>{camera.title}</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={({ pressed }) => [styles.closeButton, pressed && { opacity: pressedOpacity }]}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {(camera.view || camera.direction) && (
              <Text style={styles.subtitle}>
                {[camera.view, camera.direction && `Facing ${camera.direction}`].filter(Boolean).join(" · ")}
              </Text>
            )}
            <View style={styles.imageWrap}>
              <Image source={{ uri: src }} style={styles.image} resizeMode="cover" />
            </View>
            <Text style={styles.caption}>
              Real live NSW government traffic camera (Transport for NSW open data) — refreshes
              about once a minute while this sheet is open.
            </Text>
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.high,
  },
  handleIndicator: {
    backgroundColor: colors.border,
    width: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  caption: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
