import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlaceDetails } from "@/services/places";

const SEARCH_HISTORY_KEY = "@trackline/searchHistory";
// Caps how many recent destinations are kept at all (the "show all" expanded view) -- not the
// default collapsed count (3), which the UI layer decides on its own.
const MAX_HISTORY_ENTRIES = 12;

export async function getSearchHistory(): Promise<PlaceDetails[]> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupted/unparsable cache entry should never break search -- just behave as if there
    // was no history yet.
    return [];
  }
}

/** Records a real destination pick, most-recent-first, de-duplicated by placeId (re-picking an
 *  existing entry moves it back to the front instead of creating a second copy). Returns the
 *  updated list so callers can update their own state without a second read. */
export async function addSearchHistoryEntry(place: PlaceDetails): Promise<PlaceDetails[]> {
  const current = await getSearchHistory();
  const deduped = current.filter((p) => p.placeId !== place.placeId);
  const next = [place, ...deduped].slice(0, MAX_HISTORY_ENTRIES);
  await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function removeSearchHistoryEntry(placeId: string): Promise<PlaceDetails[]> {
  const current = await getSearchHistory();
  const next = current.filter((p) => p.placeId !== placeId);
  await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  return next;
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
}
