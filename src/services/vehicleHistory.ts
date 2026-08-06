import AsyncStorage from "@react-native-async-storage/async-storage";

// Persistent log of vehicles this device has actually seen -- either fully identified by the
// live AI detector (a confirmed, on-device plate read, same confirm logic
// VehicleDetectionScreen already used to decide when to SHOW a plate) or manually looked up via
// the REV check screen. Deliberately keyed by plate text, not detection track id: a track id is
// only ever valid for the single camera session that produced it (speedTracker.ts resets it on
// every screen open), while the plate is the one real, stable identity a vehicle actually has
// across separate sightings/sessions.
export type VehicleHistorySource = "detected" | "manual";

export interface VehicleHistoryEntry {
  plate: string; // normalized: trimmed, uppercased, matches what's shown on screen. May be a
  // synthetic "VIN:<vin>" key when a manual check was run with a VIN but no known plate -- see
  // recordManualCheck.
  state: string | null; // AU state/territory code (utils/auStates.ts) -- only known for a manual entry
  vin: string | null; // real PPSR/NEVDIS searches key on this, never the plate -- see revCheck.ts
  label: "Vehicle" | "Heavy Vehicle";
  lastSpeedKmh: number | null;
  lastSpeedKind: "absolute" | "closing" | null;
  firstSeenAt: number;
  lastSeenAt: number;
  timesSeen: number;
  source: VehicleHistorySource;
}

const STORAGE_KEY = "@trackline/vehicleHistory";
// Caps total stored entries -- the oldest-by-lastSeenAt entries are dropped first once over the
// cap, same pattern as searchHistory.ts's MAX_HISTORY_ENTRIES.
const MAX_HISTORY_ENTRIES = 200;

function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, "");
}

export async function getVehicleHistory(): Promise<VehicleHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as VehicleHistoryEntry[]).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  } catch {
    // A corrupted/unparsable cache should never break the detection screen or REV check flow --
    // just behave as if there was no history yet.
    return [];
  }
}

async function writeHistory(entries: VehicleHistoryEntry[]): Promise<VehicleHistoryEntry[]> {
  const sorted = entries.sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, MAX_HISTORY_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  return sorted;
}

/** Called the instant a live detection's plate read is actually confirmed (see
 *  VehicleDetectionScreen's PLATE_CONFIRM_COUNT logic) -- automatically records/updates that
 *  vehicle's history entry with no user action needed, per the explicit "fully detected and
 *  automatically saved" request. Merges into the SAME entry on a repeat sighting (same plate,
 *  this session or a past one) rather than creating a duplicate row. */
export async function upsertDetectedVehicle(
  rawPlate: string,
  info: { label: "Vehicle" | "Heavy Vehicle"; speedKmh: number | null; speedKind: "absolute" | "closing" | null }
): Promise<VehicleHistoryEntry[]> {
  const plate = normalizePlate(rawPlate);
  if (!plate) return getVehicleHistory();
  const current = await getVehicleHistory();
  const now = Date.now();
  const existingIndex = current.findIndex((e) => e.plate === plate);
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    current[existingIndex] = {
      ...existing,
      label: info.label,
      lastSpeedKmh: info.speedKmh,
      lastSpeedKind: info.speedKind,
      lastSeenAt: now,
      timesSeen: existing.timesSeen + 1,
    };
  } else {
    current.push({
      plate,
      state: null,
      vin: null,
      label: info.label,
      lastSpeedKmh: info.speedKmh,
      lastSpeedKind: info.speedKind,
      firstSeenAt: now,
      lastSeenAt: now,
      timesSeen: 1,
      source: "detected",
    });
  }
  return writeHistory(current);
}

/** Called when a REV check is actually started from the manual plate-entry screen -- records the
 *  plate (and its selected state, since a manual entry knows one and a live detection doesn't)
 *  so it shows up in history the same as an auto-detected vehicle would. Never overwrites an
 *  existing "detected" entry's richer state (label/speed) with blanks, just refreshes state and
 *  bumps the seen count/timestamp. A real PPSR/NEVDIS search (see revCheck.ts) always keys on
 *  VIN, not plate -- so when the driver only typed a VIN and no known plate, this falls back to
 *  a synthetic "VIN:<vin>" key just so the check still shows up in history at all. */
export async function recordManualCheck(
  rawPlate: string,
  state: string | null,
  vin: string | null = null
): Promise<VehicleHistoryEntry[]> {
  const normalizedVin = vin ? vin.trim().toUpperCase() : null;
  const plate = normalizePlate(rawPlate) || (normalizedVin ? `VIN:${normalizedVin}` : "");
  if (!plate) return getVehicleHistory();
  const current = await getVehicleHistory();
  const now = Date.now();
  const existingIndex = current.findIndex((e) => e.plate === plate);
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    current[existingIndex] = {
      ...existing,
      state: state ?? existing.state,
      vin: normalizedVin ?? existing.vin,
      lastSeenAt: now,
      timesSeen: existing.timesSeen + 1,
    };
  } else {
    current.push({
      plate,
      state,
      vin: normalizedVin,
      label: "Vehicle",
      lastSpeedKmh: null,
      lastSpeedKind: null,
      firstSeenAt: now,
      lastSeenAt: now,
      timesSeen: 1,
      source: "manual",
    });
  }
  return writeHistory(current);
}

export async function removeVehicleHistoryEntry(rawPlate: string): Promise<VehicleHistoryEntry[]> {
  const plate = normalizePlate(rawPlate);
  const current = await getVehicleHistory();
  return writeHistory(current.filter((e) => e.plate !== plate));
}

export async function clearVehicleHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
