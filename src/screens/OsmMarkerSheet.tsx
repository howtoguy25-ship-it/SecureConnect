import React, { forwardRef, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { env } from "@/config/env";
import type { LatLng } from "@/utils/polyline";
import { colors, radius, shadow, spacing, pressedOpacity } from "@/theme/tokens";
import { TRAFFIC_LIGHT_MARKER, SPEED_CAMERA_MARKER } from "@/utils/osmMarkerStyle";

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

// Same icons as the map pin/settings toggle (see osmMarkerStyle.ts) so this sheet matches
// whichever marker was actually tapped.
const ICON_NAMES: Record<OsmMarkerKind, string> = {
  traffic_light: TRAFFIC_LIGHT_MARKER.icon,
  speed_camera: SPEED_CAMERA_MARKER.icon,
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

  // Google's Street View Static API returns a real HTTP error body (not a placeholder image)
  // when the request is rejected -- e.g. a 403 with a plain-text "enable billing" message --
  // which React Native's <Image> can't decode, so it just fails silently with no visual
  // feedback unless onLoad/onError are handled explicitly. Reset per URL so switching between
  // markers doesn't show the previous marker's loaded/error state for a beat before the new
  // request resolves.
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => {
    setImageStatus("loading");
  }, [streetViewUrl]);

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
              <View style={styles.imageWrap}>
                <Image
                  source={{ uri: streetViewUrl }}
                  style={styles.image}
                  resizeMode="cover"
                  onLoad={() => setImageStatus("loaded")}
                  onError={() => setImageStatus("error")}
                />
                {imageStatus === "loading" && (
                  <View style={styles.imageOverlay}>
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  </View>
                )}
                {imageStatus === "error" && (
                  <View style={styles.imageOverlay}>
                    <Ionicons name="image-outline" size={22} color={colors.textMuted} />
                    <Text style={styles.imageErrorText}>Street View image unavailable right now</Text>
                  </View>
                )}
              </View>
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
  imageWrap: {
    width: "100%",
    aspectRatio: 640 / 360,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs + 2,
  },
  imageErrorText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  caption: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
