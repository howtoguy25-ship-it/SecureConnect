import AsyncStorage from "@react-native-async-storage/async-storage";

const SCHEDULE_KEY = "@trackline/appOpenAdSchedule";

// Real cap: at most 3 App Open ads per calendar day (device local date), each one gated by a
// minimum real gap since the previous ad -- not a fixed timer that fires an ad regardless of
// whether the app is even open. The 1hr/3hr numbers below are minimums, not exact targets:
// since an ad can only ever show at the moment the user actually opens/resumes the app, we
// can't force it to appear at exactly the 1-2h or 3-6h mark -- we can only make sure it never
// shows too soon. In practice that means the 2nd ad lands somewhere at-or-after 1h since the
// 1st (naturally landing in the 1-2h range for someone opening the app a few times a day), and
// the 3rd lands at-or-after 3h of total elapsed time since the 1st (naturally landing in the
// 3-6h range the same way).
const MIN_GAP_BEFORE_SECOND_MS = 60 * 60 * 1000; // 1 hour since the 1st ad
const MIN_GAP_BEFORE_THIRD_MS = 3 * 60 * 60 * 1000; // 3 hours since the 1st ad (cumulative)
const MAX_ADS_PER_DAY = 3;

interface ScheduleState {
  date: string; // device-local YYYY-MM-DD; a new date resets the count to 0 for a fresh day
  shownCount: number;
  firstShownAt: number | null;
  lastShownAt: number | null;
}

function localDateKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function readSchedule(now: number): Promise<ScheduleState> {
  const today = localDateKey(now);
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ScheduleState;
      if (parsed.date === today) return parsed;
    }
  } catch {
    // A corrupted/unparsable entry should never block ads from ever showing again -- just
    // fall through to a fresh state for today, same as a first-ever launch.
  }
  return { date: today, shownCount: 0, firstShownAt: null, lastShownAt: null };
}

/** Whether an App Open ad is allowed to show right now, per today's 3-ad cap and the
 *  minimum-gap rules above. Does not itself record anything -- call recordAppOpenAdShown()
 *  only once the ad has actually been shown (a "yes" here that never results in a real show,
 *  e.g. the ad failed to load, must not burn one of today's 3 slots). */
export async function shouldShowAppOpenAd(now: number = Date.now()): Promise<boolean> {
  const state = await readSchedule(now);
  if (state.shownCount >= MAX_ADS_PER_DAY) return false;
  if (state.shownCount === 0) return true;
  if (state.shownCount === 1) {
    return state.lastShownAt != null && now - state.lastShownAt >= MIN_GAP_BEFORE_SECOND_MS;
  }
  // shownCount === 2 (the 3rd and final ad of the day)
  return state.firstShownAt != null && now - state.firstShownAt >= MIN_GAP_BEFORE_THIRD_MS;
}

export async function recordAppOpenAdShown(now: number = Date.now()): Promise<void> {
  const state = await readSchedule(now);
  const next: ScheduleState = {
    date: state.date,
    shownCount: state.shownCount + 1,
    firstShownAt: state.firstShownAt ?? now,
    lastShownAt: now,
  };
  await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(next));
}
