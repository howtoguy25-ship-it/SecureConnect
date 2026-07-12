import { useCallback, useState } from "react";
import type { ConfirmationResult, User } from "firebase/auth";
import {
  sendPhoneVerificationCode,
  confirmPhoneVerificationCode,
  phoneAccountHasPassword,
  setPhonePassword,
  verifyPhonePassword,
  resetPhonePassword,
} from "@/services/firebase";
import "./PhoneAuthPanel.css";

const RECAPTCHA_CONTAINER_ID = "phone-auth-recaptcha";

type Step = "phone" | "otp" | "create-password" | "enter-password" | "reset-password";

interface Props {
  onSignedIn: (user: User) => void;
  onCancel: () => void;
}

export function PhoneAuthPanel({ onSignedIn, onCancel }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [purpose, setPurpose] = useState<"login" | "reset">("login");
  const [phone, setPhone] = useState("+61");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [verifiedUser, setVerifiedUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friendlyError = (err: unknown, fallback: string): string => {
    const code = err instanceof Object && "code" in err ? String((err as any).code) : null;
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Wrong password.";
    if (code === "auth/invalid-phone-number") return "That doesn't look like a valid phone number (use +61...).";
    if (code === "auth/invalid-verification-code") return "That code didn't match.";
    if (code === "auth/too-many-requests") return "Too many attempts -- wait a bit and try again.";
    return err instanceof Error ? err.message : fallback;
  };

  const sendCode = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await sendPhoneVerificationCode(phone, RECAPTCHA_CONTAINER_ID);
      setConfirmation(result);
      setStep("otp");
    } catch (err) {
      setError(friendlyError(err, "Couldn't send the code."));
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const verifyCode = useCallback(async () => {
    if (!confirmation) return;
    setError(null);
    setBusy(true);
    try {
      const user = await confirmPhoneVerificationCode(confirmation, code);
      setVerifiedUser(user);
      if (purpose === "reset") {
        setStep("reset-password");
      } else if (phoneAccountHasPassword(user)) {
        setStep("enter-password");
      } else {
        setStep("create-password");
      }
    } catch (err) {
      setError(friendlyError(err, "That code didn't match."));
    } finally {
      setBusy(false);
    }
  }, [confirmation, code, purpose]);

  const createPassword = useCallback(async () => {
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await setPhonePassword(phone, password);
      if (verifiedUser) onSignedIn(verifiedUser);
    } catch (err) {
      setError(friendlyError(err, "Couldn't set your password."));
    } finally {
      setBusy(false);
    }
  }, [password, confirmPassword, phone, verifiedUser, onSignedIn]);

  const enterPassword = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const user = await verifyPhonePassword(phone, password);
      onSignedIn(user);
    } catch (err) {
      setError(friendlyError(err, "Couldn't sign in."));
    } finally {
      setBusy(false);
    }
  }, [phone, password, onSignedIn]);

  const doResetPassword = useCallback(async () => {
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await resetPhonePassword(password);
      if (verifiedUser) onSignedIn(verifiedUser);
    } catch (err) {
      setError(friendlyError(err, "Couldn't reset your password."));
    } finally {
      setBusy(false);
    }
  }, [password, confirmPassword, verifiedUser, onSignedIn]);

  const startForgotPassword = useCallback(() => {
    setPurpose("reset");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setError(null);
    setStep("phone");
  }, []);

  return (
    <div className="phone-auth-panel">
      <div id={RECAPTCHA_CONTAINER_ID} />
      <div className="phone-auth-header">{purpose === "reset" ? "Reset password" : "Sign in with phone"}</div>

      {error && <div className="phone-auth-error">{error}</div>}

      {step === "phone" && (
        <>
          <label className="phone-auth-label">Phone number</label>
          <input
            className="phone-auth-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+61412345678"
          />
          <div className="phone-auth-hint">We'll text you a real 6-digit code to verify it's you.</div>
          <button className="phone-auth-primary" disabled={busy} onClick={sendCode}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </>
      )}

      {step === "otp" && (
        <>
          <label className="phone-auth-label">Enter the code sent to {phone}</label>
          <input
            className="phone-auth-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <button className="phone-auth-primary" disabled={busy} onClick={verifyCode}>
            {busy ? "Verifying…" : "Verify"}
          </button>
        </>
      )}

      {step === "create-password" && (
        <>
          <div className="phone-auth-hint">Verified — now set a password for next time.</div>
          <label className="phone-auth-label">New password</label>
          <input
            className="phone-auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="phone-auth-label">Confirm password</label>
          <input
            className="phone-auth-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button className="phone-auth-primary" disabled={busy} onClick={createPassword}>
            {busy ? "Saving…" : "Set password"}
          </button>
        </>
      )}

      {step === "enter-password" && (
        <>
          <label className="phone-auth-label">Password</label>
          <input
            className="phone-auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="phone-auth-primary" disabled={busy} onClick={enterPassword}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button className="phone-auth-link" onClick={startForgotPassword}>
            Forgot your password?
          </button>
        </>
      )}

      {step === "reset-password" && (
        <>
          <div className="phone-auth-hint">Verified — set a new password.</div>
          <label className="phone-auth-label">New password</label>
          <input
            className="phone-auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="phone-auth-label">Confirm password</label>
          <input
            className="phone-auth-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button className="phone-auth-primary" disabled={busy} onClick={doResetPassword}>
            {busy ? "Saving…" : "Reset password"}
          </button>
        </>
      )}

      <button className="phone-auth-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
