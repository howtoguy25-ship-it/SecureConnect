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
    const verifier: ApplicationVerifier = { type: 'recaptcha', verify: async () => token };
    await startPhoneVerification(phoneNumber, verifier);
  };

  return { recaptchaRef, RecaptchaModal: RecaptchaVerifierModal, sendCode };
}
