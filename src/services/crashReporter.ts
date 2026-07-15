import { Platform } from "react-native";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/services/firebase";

// Apple's own crash reports (.ips files, via Settings -> Analytics Data) only capture the
// *native* call stack -- when a fatal error originates on the JS side (which is what's been
// happening: the reports all show the generic RCTExceptionsManager reportFatal: frames, not
// the actual JS error message or stack), there's no way to see what actually went wrong from
// the .ips file alone. This hooks React Native's own global JS error handler and best-effort
// reports the real message/stack to Firestore before the app goes down, so the next crash is
// actually diagnosable instead of another guessing round.
export function installCrashReporter(): void {
  const g = globalThis as unknown as {
    ErrorUtils?: { setGlobalHandler: (fn: (error: unknown, isFatal?: boolean) => void) => void; getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void };
  };
  if (!g.ErrorUtils) return;

  const previousHandler = g.ErrorUtils.getGlobalHandler?.();

  g.ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportCrash(error, isFatal).catch(() => {
      // Best-effort only -- if the report write itself fails (e.g. offline, or the crash
      // happened before Firebase finished initializing), there's nothing more useful to do
      // than let the original handler run.
    });
    previousHandler?.(error, isFatal);
  });
}

function reportCrash(error: unknown, isFatal?: boolean): Promise<unknown> {
  const err = error instanceof Error ? error : new Error(String(error));
  return addDoc(collection(db, "crashReports"), {
    uid: auth.currentUser?.uid ?? "unknown",
    isFatal: Boolean(isFatal),
    message: err.message,
    stack: err.stack ?? null,
    platform: Platform.OS,
    platformVersion: Platform.Version,
    createdAt: serverTimestamp(),
  });
}
