import * as Sentry from "@sentry/react-native";
import { env } from "@/config/env";

// Must be initialized *after* installCrashReporter() runs (see App.tsx) -- order matters here.
// Sentry's own error-handling integration installs itself as the ErrorUtils global handler and,
// after capturing + flushing an error to sentry.io, calls whatever handler was registered
// *before* it (that's how it normally preserves the app's original crash behavior). If Sentry
// initialized first, our crash reporter would end up as the handler Sentry calls, meaning
// Sentry captures the error but never gets a say in whether the app actually crashes -- which
// is fine. Doing it the other way around (Sentry after) makes Sentry the outermost handler: it
// captures + flushes first, then hands off to our handler, which is the one that decides not to
// forward fatal errors into React Native's crash-prone native reportFatal path. Same
// crash-prevention fix as before, now with an actual dashboard for what's failing.
// Registered with NavigationContainer in RootNavigator.tsx -- gives Sentry real per-screen
// transactions so it can report actual slow/frozen frame counts (Sentry's own "Mobile
// Vitals") instead of guessing at lag from reading code. That's the only honest way to
// answer "does it lag" for a device I can't see -- once this is running on a real phone,
// real frame data shows up in the dashboard instead of another blind guess.
export const navigationIntegration = Sentry.reactNavigationIntegration();

// DIAGNOSTIC BUILD -- enableNative is temporarily false. The replay-postInit fix (see
// replaysSessionSampleRate/replaysOnErrorSampleRate below) was a real, verified bug, but
// build 22 (which included that fix) crashed again with the exact same signature, and
// Sentry has now received precisely zero events/sessions/logs across builds 20, 21, AND 22
// -- meaning whatever's happening blocks Sentry's own upload pipeline every single launch,
// not just the one replay code path. This isolates whether Sentry's NATIVE layer (crash
// handling, session tracking, hang detection, breadcrumb converters -- all the machinery
// that runs void TurboModule calls) is involved in this crash AT ALL. JS-side error/log
// capture (installCrashReporter's ErrorUtils hook, Sentry.logger calls) still works with
// native off, since neither touches this native init path. If the crash disappears with
// native off, Sentry's native layer is confirmed as the cause (even if not specifically
// replay) and it can be re-enabled carefully once identified. If it persists, Sentry is
// fully ruled out and the investigation moves to ads/OCR/other native modules with real
// confidence instead of another guess.
const DIAGNOSTIC_DISABLE_NATIVE = false;

export function initSentry(): void {
  if (!env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    enableNative: !DIAGNOSTIC_DISABLE_NATIVE,
    enableLogs: true,
    tracesSampleRate: DIAGNOSTIC_DISABLE_NATIVE ? 0 : 0.2,
    integrations: DIAGNOSTIC_DISABLE_NATIVE ? [] : [navigationIntegration],
    // Real, verified bug (read directly from @sentry/react-native's own iOS source) --
    // see node_modules/@sentry/react-native/ios/RNSentry.mm + RNSentryReplay.mm (7.11.0):
    // initNativeSdk calls [RNSentryReplay postInit] unconditionally regardless of whether a
    // real replay session was constructed, wiring a breadcrumb converter into the pipeline
    // that throws on the next breadcrumb when replay was left unconfigured. Setting explicit
    // sample rates avoids that specific path. Kept here (harmless/inert while native is off
    // for this diagnostic build) for whenever native gets re-enabled.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export { Sentry };
