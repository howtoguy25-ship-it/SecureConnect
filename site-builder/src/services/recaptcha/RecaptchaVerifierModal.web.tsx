import React, { forwardRef, useImperativeHandle } from 'react';
import type { RecaptchaVerifierHandle } from '@/services/recaptcha/RecaptchaVerifierModal.types';

// `react-native-webview` has no proper web implementation (its generic fallback build
// fails to bundle for web at all), and this app's real target is iOS anyway — this stub
// keeps web dev/testing builds from crashing on that import, without touching the real
// WebView-based verifier used on iOS/Android (see RecaptchaVerifierModal.tsx).
const RecaptchaVerifierModal = forwardRef<RecaptchaVerifierHandle>((_props, ref) => {
  useImperativeHandle(ref, () => ({
    verify: () => Promise.reject(new Error('Phone sign-in is not available on web in this build — use the iOS app.')),
  }));
  return null;
});

RecaptchaVerifierModal.displayName = 'RecaptchaVerifierModal';
export default RecaptchaVerifierModal;
