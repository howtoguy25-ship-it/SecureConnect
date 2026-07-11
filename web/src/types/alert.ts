export type AlertType = "police" | "emergency_vehicle" | "hazard" | "camera" | "crash";

export interface AlertDoc {
  id: string;
  type: AlertType;
  lat: number;
  lng: number;
  geohash: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  confirmCount: number;
  hiddenBy: string[];
}

export const ALERT_TTL_MS: Record<AlertType, number> = {
  police: 45 * 60 * 1000,
  emergency_vehicle: 45 * 60 * 1000,
  hazard: 2 * 60 * 60 * 1000,
  crash: 2 * 60 * 60 * 1000,
  camera: 24 * 60 * 60 * 1000,
};

export const ALERT_LABELS: Record<AlertType, string> = {
  police: "Police",
  emergency_vehicle: "Emergency Vehicle",
  hazard: "Hazard",
  camera: "Camera",
  crash: "Crash",
};

export const ALERT_COLORS: Record<AlertType, string> = {
  police: "#2563EB",
  emergency_vehicle: "#DC2626",
  hazard: "#F59E0B",
  camera: "#7C3AED",
  crash: "#EA580C",
};

export const ALERT_EMOJI: Record<AlertType, string> = {
  police: "🚓",
  emergency_vehicle: "🚑",
  hazard: "⚠️",
  camera: "📷",
  crash: "💥",
};
