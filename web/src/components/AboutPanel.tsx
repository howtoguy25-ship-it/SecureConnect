import type { User } from "firebase/auth";
import { BUSINESS_INFO } from "@/config/business";
import { ADMIN_EMAILS, ADMIN_PHONE_NUMBERS } from "@/config/admin";
import type { WebSettings } from "@/hooks/useSettings";
import "./AboutPanel.css";

const APP_VERSION = "1.0.0";

const THEME_OPTIONS: { value: WebSettings["theme"]; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "☀️ Light" },
  { value: "dark", label: "🌙 Dark" },
];

interface Props {
  theme: WebSettings["theme"];
  onSetTheme: (theme: WebSettings["theme"]) => void;
  user: User | null;
  onSignInGoogle: () => void;
  onSignInApple: () => void;
  onSignInPhone: () => void;
  onSignOut: () => void;
  onOpenAdmin: () => void;
  onClose: () => void;
}

export function AboutPanel({
  theme,
  onSetTheme,
  user,
  onSignInGoogle,
  onSignInApple,
  onSignInPhone,
  onSignOut,
  onOpenAdmin,
  onClose,
}: Props) {
  const isRealAccount = !!user && !user.isAnonymous;
  const isAdmin =
    (!!user?.email && ADMIN_EMAILS.includes(user.email)) ||
    (!!user?.phoneNumber && ADMIN_PHONE_NUMBERS.includes(user.phoneNumber));

  return (
    <div className="about-panel">
      <img src="/logo.png" alt="TrackLine" className="about-logo" />
      <div className="about-name">TrackLine</div>
      <div className="about-version">Version {APP_VERSION}</div>
      {BUSINESS_INFO.businessName && <div className="about-meta">{BUSINESS_INFO.businessName}</div>}
      {BUSINESS_INFO.abn && <div className="about-meta">ABN {BUSINESS_INFO.abn}</div>}

      <div className="theme-switch">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={theme === opt.value ? "theme-switch-active" : ""}
            onClick={() => onSetTheme(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="account-section">
        {isRealAccount ? (
          <>
            <div className="account-signed-in">
              Signed in as <strong>{user.displayName ?? user.phoneNumber ?? user.email}</strong>
            </div>
            <button className="about-close" onClick={onSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <div className="account-prompt">Sign in to keep your reports linked to your account</div>
            <button className="account-signin-button account-signin-google" onClick={onSignInGoogle}>
              Continue with Google
            </button>
            <button className="account-signin-button account-signin-apple" onClick={onSignInApple}>
              Continue with Apple
            </button>
            <button className="account-signin-button" onClick={onSignInPhone}>
              Continue with phone
            </button>
          </>
        )}
      </div>

      {isAdmin && (
        <button className="about-close" onClick={onOpenAdmin}>
          Admin: sign-in history
        </button>
      )}

      <button className="about-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
