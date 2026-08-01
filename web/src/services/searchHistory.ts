export interface SearchHistoryEntry {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const SEARCH_HISTORY_KEY = "trackline.searchHistory";
// Caps how many recent destinations are kept at all (the "show all" expanded view) -- not the
// default collapsed count, which the UI layer decides on its own.
const MAX_HISTORY_ENTRIES = 12;

export function getSearchHistory(): SearchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
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
export function addSearchHistoryEntry(entry: SearchHistoryEntry): SearchHistoryEntry[] {
  const current = getSearchHistory();
  const deduped = current.filter((p) => p.placeId !== entry.placeId);
  const next = [entry, ...deduped].slice(0, MAX_HISTORY_ENTRIES);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal -- worst case the entry isn't persisted this time.
  }
  return next;
}

export function removeSearchHistoryEntry(placeId: string): SearchHistoryEntry[] {
  const next = getSearchHistory().filter((p) => p.placeId !== placeId);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal.
  }
  return next;
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch {
    // Non-fatal.
  }
}
