import { useRef } from 'react';
import { ApplicationVerifier } from 'firebase/auth';
import { useAuth } from '@/context/AuthContext';
import RecaptchaVerifierModal, { RecaptchaVerifierHandle } from '@/services/recaptcha/RecaptchaVerifierModal';

export function usePhoneVerification() {
  const { startPhoneVerification } = useAuth();
  const recaptchaRef = useRef<RecaptchaVerifierHandle>(null);

  const sendCode = async (phoneNumber: string) => {
    const token = await recaptchaRef.current!.verify();
    // Firebase's ApplicationVerifier just needs a resolved reCAPTCHA token — we already
    // solved it via the WebView, so wrap it as a verifier whose verify() resolves instantly.
    // Firebase's internal phone sign-in flow unconditionally calls verifier._reset() in a
    // finally block (it's not part of the public ApplicationVerifier type, but the internal
    // code calls it anyway) -- without a no-op here it throws "_reset is not a function"
    // right after the code is sent.
    const verifier: ApplicationVerifier & { _reset(): void } = {
      type: 'recaptcha',
      verify: async () => token,
      _reset: () => {},
    };
    await startPhoneVerification(phoneNumber, verifier);
  };

  return { recaptchaRef, RecaptchaModal: RecaptchaVerifierModal, sendCode };
}
