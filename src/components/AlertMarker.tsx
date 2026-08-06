import React from "react";
import { View, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import { ALERT_COLORS, type AlertDoc } from "@/types/alert";
import { AlertTypeGlyph } from "@/components/AlertTypeGlyph";

interface Props {
  alert: AlertDoc;
  onPress: (alert: AlertDoc) => void;
}

// Memoized so MapScreen re-renders (e.g. every GPS tick, which changes currentLatLng but not
// the alerts list itself) don't cascade into reconciling every marker on screen -- onPress is
// already a stable useCallback([]) from MapScreen (onMarkerPress), so only a real change to
// this specific alert actually re-renders it.
export const AlertMarker = React.memo(function AlertMarker({ alert, onPress }: Props) {
  return (
    <Marker
      coordinate={{ latitude: alert.lat, longitude: alert.lng }}
      // react-native-maps fires MapView's own onPress *in addition to* a tapped Marker's onPress
      // on the same touch (confirmed native iOS behavior, same class of issue already worked
      // around for the speed-camera cluster markers) -- without stopping it here, tapping an
      // alert also ran MapScreen's onMapPress Places lookup for whatever's directly underneath,
      // opening the street/POI info sheet on top of this alert's own detail sheet a moment
      // later. Real, confirmed root cause of "tapping an alert also shows the street" -- this
      // stops the tap here so only the alert's own sheet ever opens.
      onPress={(e) => {
        e.stopPropagation();
        onPress(alert);
      }}
      tracksViewChanges={false}
    >
      <View style={[styles.pin, { backgroundColor: ALERT_COLORS[alert.type] }]}>
        <AlertTypeGlyph type={alert.type} size={18} color="#FFFFFF" />
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
