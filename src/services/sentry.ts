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

export function initSentry(): void {
  if (!env.sentryDsn) return;
  Sentry.init({
    dsn: env.sentryDsn,
    enableNative: true,
    enableLogs: true,
    tracesSampleRate: 0.2,
    integrations: [navigationIntegration],
    // Root cause of the "crashes ~1-2s after every launch" bug, confirmed by reading
    // @sentry/react-native's own iOS source (node_modules/@sentry/react-native/ios/
    // RNSentry.mm + RNSentryReplay.mm, version 7.11.0): when *neither* replay sample rate
    // is set, RNSentryReplay.updateOptions returns early without constructing a real replay
    // session -- but RNSentry.mm's initNativeSdk calls [RNSentryReplay postInit] completely
    // unconditionally right after (no guard on the isSessionReplayEnabled flag it just
    // computed), which wires a breadcrumb converter into the pipeline every breadcrumb flows
    // through, pointed at a replay session that was never actually created. The very next
    // breadcrumb (Sentry's own automatic navigation/HTTP breadcrumbs, or any Sentry.logger
    // call) throws inside that converter -- and since it's a void TurboModule callback with
    // no try/catch, it's an instant, unrecoverable SIGABRT (matches
    // github.com/getsentry/sentry-react-native/issues/5679 exactly: iOS 16+, release build,
    // New Architecture, replay unconfigured). Setting explicit sample rates (even 0, which
    // keeps replay itself fully disabled) makes updateOptions take the properly-initialized
    // path instead, so postInit has a real (inactive) replay session to attach to.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

export { Sentry };
