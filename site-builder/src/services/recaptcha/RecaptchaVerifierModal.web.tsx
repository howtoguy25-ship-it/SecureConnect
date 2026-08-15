import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { RecaptchaVerifier } from 'firebase/auth';
import { auth } from '@/services/firebase';
import type { RecaptchaVerifierHandle } from '@/services/recaptcha/RecaptchaVerifierModal.types';

let containerCounter = 0;

// Real browsers have a real DOM, so phone auth on web doesn't need the WebView hack the
// native build uses (see RecaptchaVerifierModal.tsx) -- Firebase's own RecaptchaVerifier
// attaches directly to a hidden container element and solves invisibly in the vast
// majority of cases, only showing Google's visible challenge if it can't confirm
// automatically.
const RecaptchaVerifierModal = forwardRef<RecaptchaVerifierHandle>((_props, ref) => {
  const containerId = useRef(`recaptcha-container-${containerCounter++}`).current;
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    verify: async () => {
      if (!auth) throw new Error('Firebase is not configured yet — see ROADMAP.md "Setup" to add your project config to .env.');
      try {
        if (!verifierRef.current) {
          verifierRef.current = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
        }
        return await verifierRef.current.verify();
      } catch (err) {
        // A stale/expired verifier can't be reused -- drop it so the next attempt (e.g.
        // "Resend code") builds a fresh one instead of failing forever.
        verifierRef.current?.clear();
        verifierRef.current = null;
        throw err;
      }
    },
  }));

  return <View nativeID={containerId} />;
});

RecaptchaVerifierModal.displayName = 'RecaptchaVerifierModal';
export default RecaptchaVerifierModal;
