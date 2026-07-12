export type AlertType = "police" | "emergency_vehicle" | "hazard" | "camera" | "crash" | "traffic_light";

export interface AlertDoc {
  id: string;
  type: AlertType;
  lat: number;
  lng: number;
  geohash: string;
  createdBy: string;
  createdAt: number; // ms epoch
  expiresAt: number; // ms epoch
  confirmCount: number;
  hiddenBy: string[];
}

// Speed cameras and traffic lights are community-reported like everything else here —
// there's no licensed real-time government feed for either wired in, so treat these the
// same as any other crowd-sourced alert (can be stale/wrong), not an authoritative source.
export const ALERT_TTL_MS: Record<AlertType, number> = {
  police: 45 * 60 * 1000,
  emergency_vehicle: 45 * 60 * 1000,
  hazard: 2 * 60 * 60 * 1000,
  crash: 2 * 60 * 60 * 1000,
  camera: 24 * 60 * 60 * 1000,
  traffic_light: 2 * 60 * 60 * 1000,
};

export const ALERT_LABELS: Record<AlertType, string> = {
  police: "Police",
  emergency_vehicle: "Emergency Vehicle",
  hazard: "Hazard",
  camera: "Speed Camera",
  crash: "Crash",
  traffic_light: "Traffic Light",
};

// MaterialCommunityIcons names (used by AlertMarker / AlertReportSheet)
export const ALERT_ICONS: Record<AlertType, string> = {
  police: "police-badge",
  emergency_vehicle: "ambulance",
  hazard: "alert",
  camera: "cctv",
  crash: "car-crash",
  traffic_light: "traffic-light",
};

export const ALERT_COLORS: Record<AlertType, string> = {
  police: "#2563EB",
  emergency_vehicle: "#DC2626",
  hazard: "#F59E0B",
  camera: "#7C3AED",
  crash: "#EA580C",
  traffic_light: "#0D9488",
};
