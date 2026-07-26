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
    tracesSampleRate: 0.2,
    integrations: [navigationIntegration],
  });
}

export { Sentry };
