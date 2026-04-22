export const colors = {
  bg: "#0A0A0A",
  surface: "#141414",
  surfaceElevated: "#1C1C1C",
  border: "#262626",
  text: "#F5F5F5",
  textMuted: "#A3A3A3",
  accent: "#F04438",
  accentPressed: "#B42318",
  success: "#12B76A",
  warning: "#F79009",
} as const;

export type ColorToken = keyof typeof colors;
