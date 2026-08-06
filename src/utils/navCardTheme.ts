/**
 * Color themes for the navigation instruction card (see NavigationInstructionCard.tsx) --
 * separate from the map's own color themes (mapStyle.ts), this only recolors the card itself.
 * Picked in Settings; "aqua" specifically uses a muted, low-saturation yellow for its text per
 * explicit request ("yellow is clear and not bright") -- a full-saturation yellow reads as
 * harsh/glary against a bright background, especially at night.
 */
export type NavCardThemeKey = "dark" | "light" | "aqua";

export const NAV_CARD_THEME_LABELS: Record<NavCardThemeKey, string> = {
  dark: "Black & White",
  light: "White & Black",
  aqua: "Aqua & Yellow",
};

export interface NavCardThemeColors {
  background: string;
  // Same background color at reduced opacity, used when the transparency toggle is on -- the
  // map/live camera behind the card stays visible through it. textShadowColor below is what
  // keeps text readable at this opacity, not the background alone.
  backgroundTransparent: string;
  text: string;
  textSecondary: string;
  // Opposite-toned shadow behind every piece of text -- gives real legibility over whatever
  // varied, uncontrolled map/video content shows through when the card is transparent, and a
  // subtle depth even at full opacity.
  textShadowColor: string;
  iconWrapBg: string;
  iconColor: string;
  actionBg: string;
  actionText: string;
  exitButtonBg: string;
  exitButtonIcon: string;
  toggleBg: string;
  toggleIcon: string;
}

export const NAV_CARD_THEMES: Record<NavCardThemeKey, NavCardThemeColors> = {
  dark: {
    background: "#111827",
    backgroundTransparent: "rgba(17,24,39,0.38)",
    text: "#FFFFFF",
    textSecondary: "#D1D5DB",
    textShadowColor: "rgba(0,0,0,0.85)",
    iconWrapBg: "#2563EB",
    iconColor: "#FFFFFF",
    actionBg: "rgba(255,255,255,0.08)",
    actionText: "#FFFFFF",
    exitButtonBg: "#FFFFFF",
    exitButtonIcon: "#111827",
    toggleBg: "rgba(255,255,255,0.14)",
    toggleIcon: "#FFFFFF",
  },
  light: {
    background: "#FFFFFF",
    backgroundTransparent: "rgba(255,255,255,0.42)",
    text: "#111827",
    textSecondary: "#374151",
    textShadowColor: "rgba(255,255,255,0.9)",
    iconWrapBg: "#2563EB",
    iconColor: "#FFFFFF",
    actionBg: "rgba(17,24,39,0.06)",
    actionText: "#111827",
    exitButtonBg: "#111827",
    exitButtonIcon: "#FFFFFF",
    toggleBg: "rgba(17,24,39,0.08)",
    toggleIcon: "#111827",
  },
  aqua: {
    background: "#0E7A8C",
    backgroundTransparent: "rgba(14,122,140,0.38)",
    text: "#F5DE83",
    textSecondary: "#E4F3EE",
    textShadowColor: "rgba(0,0,0,0.85)",
    iconWrapBg: "#0B5C6B",
    iconColor: "#F5DE83",
    actionBg: "rgba(245,222,131,0.14)",
    actionText: "#F5DE83",
    exitButtonBg: "#F5DE83",
    exitButtonIcon: "#0E7A8C",
    toggleBg: "rgba(245,222,131,0.18)",
    toggleIcon: "#F5DE83",
  },
};
