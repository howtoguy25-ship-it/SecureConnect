import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { LinearGradient } from "expo-linear-gradient";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface MenuItemProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  gradientColors: [string, string];
  onPress: () => void;
}

function MenuItem({ icon, title, subtitle, gradientColors, onPress }: MenuItemProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: theme.backgroundSecondary, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}
    >
      <LinearGradient
        colors={gradientColors}
        style={styles.iconContainer}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Feather name={icon} size={28} color="#FFFFFF" />
      </LinearGradient>
      <View style={styles.menuTextContainer}>
        <Text style={[styles.menuTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.menuSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={24} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function DiscoverScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Discover</Text>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          Capture moments and have fun
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          CAPTURE
        </Text>
        <MenuItem
          icon="camera"
          title="Camera"
          subtitle="Take photos and share with friends"
          gradientColors={["#8B5CF6", "#6366F1"]}
          onPress={() => navigation.navigate("Camera")}
        />

        <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: Spacing.xl }]}>
          ENTERTAINMENT
        </Text>
        <MenuItem
          icon="play-circle"
          title="Mini Games"
          subtitle="Fun games to play while you chat"
          gradientColors={["#F59E0B", "#EF4444"]}
          onPress={() => navigation.navigate("MiniGames")}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 16,
    marginTop: Spacing.xs,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  menuTextContainer: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  menuSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
});
