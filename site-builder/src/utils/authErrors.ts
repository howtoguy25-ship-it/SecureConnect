const MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account already exists with that email. Try signing in instead.',
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/invalid-phone-number': "That phone number doesn't look right. Include your country code, e.g. +1 555 123 4567.",
  'auth/invalid-verification-code': "That code isn't right. Double-check and try again.",
  'auth/code-expired': 'That code expired. Request a new one.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
};

export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
