import * as Sentry from '@sentry/react-native';

// A real, working DSN is what turns "the app crashed" into "here's the exact file, line, and
// device that broke" instead of a screen recording we have to reverse-engineer -- see
// ErrorBoundary and utils/globalErrorHandler, both of which report through here. Without a
// DSN configured (EXPO_PUBLIC_SENTRY_DSN unset), Sentry.init below is a no-op and every
// capture call below silently does nothing -- the app behaves exactly as it did before this
// file existed, it just doesn't get crash visibility until a real DSN is added.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initCrashReporting() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Real user-facing errors are rare enough in a small app that capturing every one (not a
    // sample) is affordable, and missing the one time something broke defeats the purpose.
    tracesSampleRate: 1.0,
    // Screen names / navigation events show up as breadcrumbs leading into a crash report,
    // which is what actually lets "what was the user doing right before this" be answered
    // without asking them.
    enableAutoSessionTracking: true,
  });
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!dsn) {
    console.error('Crash reporting has no DSN configured -- logging locally only:', error);
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
