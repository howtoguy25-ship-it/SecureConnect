import React, { forwardRef, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { env } from "@/config/env";
import type { LatLng } from "@/utils/polyline";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";

export type OsmMarkerKind = "traffic_light" | "speed_camera";

interface Props {
  kind: OsmMarkerKind | null;
  location: LatLng | null;
  onClose: () => void;
  onSheetChange?: (index: number) => void;
}

const LABELS: Record<OsmMarkerKind, string> = {
  traffic_light: "Traffic light",
  speed_camera: "Speed camera",
};

const ICON_NAMES: Record<OsmMarkerKind, string> = {
  traffic_light: "traffic-light",
  speed_camera: "cctv",
};

export const OsmMarkerSheet = forwardRef<BottomSheet, Props>(function OsmMarkerSheet(
  { kind, location, onClose, onSheetChange },
  ref
) {
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => ["46%"], []);

  // There's no per-camera/per-light photo dataset -- OSM only gives a coordinate. Real Google
  // Street View imagery *at that exact coordinate* is the closest genuinely real answer to
  // "show me where this is" (vs. just a generic icon on the map), pulling from Google's actual
  // street-level photography rather than anything mocked/placeholder.
  const streetViewUrl = location
    ? `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${location.latitude},${location.longitude}&fov=80&key=${env.googlePlacesApiKey}`
    : null;

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
        {kind && location && (
          <>
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <MaterialCommunityIcons name={ICON_NAMES[kind] as any} size={20} color={colors.text} />
                <Text style={styles.title}>{LABELS[kind]}</Text>
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
            <Text style={styles.subtitle}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </Text>
            {streetViewUrl && (
              <Image source={{ uri: streetViewUrl }} style={styles.image} resizeMode="cover" />
            )}
            <Text style={styles.caption}>
              Real Google Street View imagery of this spot -- location from OpenStreetMap community data.
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
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
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
  image: {
    width: "100%",
    aspectRatio: 640 / 360,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  caption: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
