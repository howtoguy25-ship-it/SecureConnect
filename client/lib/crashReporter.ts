import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const STORAGE_KEY = "pryvo:lastFatalError";
const RELOAD_GUARD_KEY = "pryvo:lastCrashReload";
// If a second fatal error happens within this window after an auto-recovery
// reload, we let the app hard-crash instead of reloading again — this
// prevents an infinite restart loop when the error occurs during startup.
const RELOAD_LOOP_WINDOW_MS = 60_000;

// Loaded asynchronously at install time so the (synchronous) fatal handler
// can consult it without awaiting.
let lastCrashReloadAt = 0;
// Strict one-shot: at most one auto-recovery reload per JS run, decided
// synchronously so it can never race AsyncStorage hydration.
let reloadedThisRun = false;

type FatalReport = {
  message: string;
  stack: string;
  isFatal: boolean;
  platform: string;
  at: string;
};

function buildReport(error: unknown, isFatal: boolean): FatalReport {
  const err = error as { message?: unknown; stack?: unknown } | null;
  return {
    message: String(err?.message ?? error).slice(0, 1000),
    stack: String(err?.stack ?? "").slice(0, 4000),
    isFatal,
    platform: `${Platform.OS} ${Platform.Version ?? ""}`.trim(),
    at: new Date().toISOString(),
  };
}

function postReport(report: FatalReport): Promise<unknown> {
  const url = new URL("/api/client-crash", getApiUrl()).toString();
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
}

/**
 * Install a global fatal-error reporter. Must be called as early as possible
 * (top of App.tsx). On a fatal JS error it:
 *   1. Persists the error to AsyncStorage (survives the crash).
 *   2. Fires a best-effort POST to the server so it shows in production logs.
 *   3. Delegates to the previous handler (RN redbox/dev, RCTFatal in release).
 * On the next launch, any persisted crash from the previous run is uploaded.
 */
export function installCrashReporter() {
  try {
    const ErrorUtils = (global as any).ErrorUtils;
    if (!ErrorUtils?.setGlobalHandler) return;
    const previousHandler = ErrorUtils.getGlobalHandler?.();

    // Load the last auto-recovery timestamp so the synchronous fatal handler
    // can detect (and break) restart loops without awaiting storage.
    AsyncStorage.getItem(RELOAD_GUARD_KEY)
      .then((v) => {
        const n = Number(v);
        if (Number.isFinite(n)) lastCrashReloadAt = n;
      })
      .catch(() => {});

    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      try {
        const report = buildReport(error, !!isFatal);
        // Persist first — the network call may not finish before abort.
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(report)).catch(() => {});
        postReport(report).catch(() => {});
      } catch {
        // Reporting must never make things worse.
      }

      // Auto-recovery: in release builds a fatal JS error normally aborts the
      // whole app (SIGABRT via RCTFatal / expo error recovery). Instead,
      // reload the JS bundle in place — the user sees a brief restart and
      // stays logged in. Guarded so two fatals within RELOAD_LOOP_WINDOW_MS
      // fall through to the native crash rather than looping forever.
      if (isFatal && !__DEV__ && !reloadedThisRun) {
        const now = Date.now();
        if (now - lastCrashReloadAt > RELOAD_LOOP_WINDOW_MS) {
          reloadedThisRun = true;
          lastCrashReloadAt = now;
          AsyncStorage.setItem(RELOAD_GUARD_KEY, String(now)).catch(() => {});
          try {
            // Late require so a bundling issue here can never break startup.
            const { reloadAppAsync } = require("expo");
            // Small delay gives AsyncStorage a chance to flush the report.
            setTimeout(() => {
              reloadAppAsync().catch(() => {
                if (previousHandler) previousHandler(error, isFatal);
              });
            }, 150);
            return;
          } catch {
            // Fall through to the previous (crashing) handler.
          }
        }
      }

      if (previousHandler) previousHandler(error, isFatal);
    });
  } catch {
    // Never let the reporter itself break startup.
  }
}

/** Upload (and clear) any fatal error persisted by a previous crashed run. */
export async function flushPendingCrashReport() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const report = JSON.parse(stored) as FatalReport;
    await postReport({ ...report, message: `[previous run] ${report.message}` });
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep it stored; retry on next launch.
  }
}
