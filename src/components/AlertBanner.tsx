import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Props {
  visible: boolean;
  message: string;
  onDismiss: () => void;
}

export function AlertBanner({ visible, message, onDismiss }: Props) {
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -120,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

    if (visible) {
      const timer = setTimeout(onDismiss, 6000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
      <MaterialCommunityIcons name="ambulance" size={22} color="#FFFFFF" />
      <Text style={styles.text}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={12}>
        <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    marginTop: 56,
    backgroundColor: "#DC2626",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
    flex: 1,
  },
});
