import React from "react";
import { View, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ALERT_COLORS, ALERT_ICONS, type AlertDoc } from "@/types/alert";

interface Props {
  alert: AlertDoc;
  onPress: (alert: AlertDoc) => void;
}

export function AlertMarker({ alert, onPress }: Props) {
  return (
    <Marker
      coordinate={{ latitude: alert.lat, longitude: alert.lng }}
      onPress={() => onPress(alert)}
      tracksViewChanges={false}
    >
      <View style={[styles.pin, { backgroundColor: ALERT_COLORS[alert.type] }]}>
        <MaterialCommunityIcons name={ALERT_ICONS[alert.type] as any} size={18} color="#FFFFFF" />
      </View>
    </Marker>
  );
}

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
