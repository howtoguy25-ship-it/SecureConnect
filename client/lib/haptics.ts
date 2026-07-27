import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export const haptics = {
  light: async () => {
    if (Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      // Haptics not available on this device
    }
  },
  medium: async () => {
    if (Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      // Haptics not available on this device
    }
  },
  heavy: async () => {
    if (Platform.OS === "web") return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {
      // Haptics not available on this device
    }
  },
  success: async () => {
    if (Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      // Haptics not available on this device
    }
  },
  warning: async () => {
    if (Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      // Haptics not available on this device
    }
  },
  error: async () => {
    if (Platform.OS === "web") return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (e) {
      // Haptics not available on this device
    }
  },
  selection: async () => {
    if (Platform.OS === "web") return;
    try {
      await Haptics.selectionAsync();
    } catch (e) {
      // Haptics not available on this device
    }
  },
};
