import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Feather } from "@expo/vector-icons";
import { Spacing, BorderRadius } from "@/constants/theme";
import { haptics } from "@/lib/haptics";

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "backspace"],
];

interface PinPadProps {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  theme: any;
  disabled?: boolean;
}

/** Real numeric keypad with tactile buttons + a dot progress indicator — used
 * by both the App Lock unlock screen and its setup/change flow. */
export function PinPad({ value, onChange, maxLength = 8, theme, disabled }: PinPadProps) {
  const handlePress = (key: string) => {
    if (disabled) return;
    if (key === "backspace") {
      haptics.light();
      onChange(value.slice(0, -1));
      return;
    }
    if (key === "" || value.length >= maxLength) return;
    haptics.light();
    onChange(value + key);
  };

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {Array.from({ length: Math.max(value.length, 4) }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: theme.primary,
                backgroundColor: i < value.length ? theme.primary : "transparent",
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {KEYS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((key, colIndex) => {
              if (key === "") {
                return <View key={colIndex} style={styles.key} />;
              }
              return (
                <Pressable
                  key={colIndex}
                  style={({ pressed }) => [
                    styles.key,
                    styles.keyButton,
                    { backgroundColor: theme.backgroundTertiary },
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handlePress(key)}
                  disabled={disabled}
                >
                  {key === "backspace" ? (
                    <Feather name="delete" size={22} color={theme.text} />
                  ) : (
                    <ThemedText type="h2" style={{ fontWeight: "600" }}>
                      {key}
                    </ThemedText>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const KEY_SIZE = 72;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
    minHeight: 16,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  grid: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  keyButton: {
    borderRadius: BorderRadius.full,
  },
});
