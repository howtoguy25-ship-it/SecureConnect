import { Alert, Platform } from "react-native";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/services/firebase";

// Every crash log seen across this whole debugging cycle -- ads, and now a completely
// unrelated camera/turbomodule call -- ends in the exact same native frames:
// `-[RCTExceptionsManager reportFatal:stack:exceptionId:extraDataAsJSON:]` followed by an
// uncaught ObjC exception and abort(). That's React Native's OWN "please report this fatal
// JS error" native method crashing while trying to report it -- not the original error
// itself. Forwarding fatal errors to React Native's default handler is what reaches that
// broken method and takes the whole app down, regardless of what actually threw in JS.
//
// So: still log the real JS error/stack to Firestore for diagnosis (Apple's .ips files never
// capture it), but for fatal errors specifically, deliberately do NOT hand off to the default
// handler -- surface it to the user instead and let the app keep running, rather than
// guaranteed-crashing every time something on the JS side throws fatally.
export function installCrashReporter(): void {
  const g = globalThis as unknown as {
    ErrorUtils?: { setGlobalHandler: (fn: (error: unknown, isFatal?: boolean) => void) => void; getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void };
  };
  if (!g.ErrorUtils) return;

  const previousHandler = g.ErrorUtils.getGlobalHandler?.();

  g.ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportCrash(error, isFatal).catch(() => {
      // Best-effort only -- if the report write itself fails (e.g. offline), there's nothing
      // more useful to do here.
    });

    if (!isFatal) {
      previousHandler?.(error, isFatal);
      return;
    }

    console.error("[fatal, recovered]", error);
    Alert.alert(
      "Something went wrong",
      "TrackLine hit an unexpected error but has recovered. If anything looks off, restart the app.",
      [{ text: "OK" }]
    );
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
