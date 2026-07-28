import { Platform } from "react-native";

const primaryBlue = "#007AFF";
const primaryBlueDark = "#0A84FF";
const gold = "#FFD700";
const success = "#34C759";
const error = "#FF3B30";
const warning = "#FF9500";

export const TabColors = {
  chats: "#007AFF",
  status: "#FF9500",
  location: "#34C759",
  calls: "#AF52DE",
  profile: "#FF2D55",
  locker: "#FFD700",
};

export const Colors = {
  light: {
    text: "#000000",
    textSecondary: "#6B6B6B",
    buttonText: "#FFFFFF",
    // Darker than the old #8E8E93 mid-grey specifically so tab labels stay
    // legible over a transparent/blurred tab bar instead of a solid dark fill.
    tabIconDefault: "#3A3A3C",
    tabIconSelected: primaryBlue,
    link: primaryBlue,
    backgroundRoot: "#FFFFFF",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#F5F5F5",
    backgroundTertiary: "#EBEBEB",
    primary: primaryBlue,
    accent: gold,
    success: success,
    error: error,
    warning: warning,
    sentBubble: primaryBlue,
    receivedBubble: "#E8E8E8",
    border: "#E0E0E0",
  },
  dark: {
    text: "#FFFFFF",
    textSecondary: "#A0A0A5",
    buttonText: "#FFFFFF",
    // Brighter than the old #8E8E93 so labels stay clearly readable over a
    // transparent/blurred dark tab bar instead of a solid near-black fill.
    tabIconDefault: "#AEAEB2",
    tabIconSelected: primaryBlueDark,
    link: primaryBlueDark,
    backgroundRoot: "#000000",
    backgroundDefault: "#0A0A0A",
    backgroundSecondary: "#1A1A1A",
    backgroundTertiary: "#2A2A2A",
    primary: primaryBlueDark,
    accent: gold,
    success: success,
    error: error,
    warning: warning,
    sentBubble: primaryBlueDark,
    receivedBubble: "#1A1A1A",
    border: "#333333",
  },
};

export const Spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 52,
  "5xl": 64,
  inputHeight: 52,
  buttonHeight: 56,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 34,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 17,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 13,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 17,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
