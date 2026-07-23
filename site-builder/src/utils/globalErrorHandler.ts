import { showAlert } from '@/utils/alert';

declare const ErrorUtils:
  | {
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    }
  | undefined;

// Catches whatever an ErrorBoundary can't: an uncaught exception thrown outside of render --
// an event handler, a promise with no .catch, a timer callback. React Native's own default
// handler for a *fatal* one of these terminates the whole app in a production/TestFlight
// build with zero on-screen explanation, which is exactly what looks like "the app just
// crashed to the home screen" with no error, no red screen, nothing. Logging it and showing
// a plain alert instead -- rather than calling through to the previous/default handler --
// keeps the app alive and in whatever state it was already in, since the JS engine itself is
// still fine in the overwhelming majority of these cases; only register this once, from the
// app's root.
export function installGlobalErrorHandler() {
  if (typeof ErrorUtils === 'undefined') return;
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error(isFatal ? 'Fatal JS error (kept the app alive):' : 'JS error:', error);
    if (isFatal) {
      showAlert('Something went wrong', "That last action didn't go through. If something looks stuck, try going back to My Projects.");
    }
  });
}
