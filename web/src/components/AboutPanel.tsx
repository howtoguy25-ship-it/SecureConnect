import { useState } from "react";
import type { User } from "firebase/auth";
import { BUSINESS_INFO } from "@/config/business";
import { ADMIN_EMAILS, ADMIN_PHONE_NUMBERS } from "@/config/admin";
import type { WebSettings } from "@/hooks/useSettings";
import { MAP_THEME_LABELS, type MapThemeKey } from "@/utils/mapStyles";
import "./AboutPanel.css";

const APP_VERSION = "1.0.0";
// Re-enabled -- Apple Developer's Services ID (com.trackline.web.signin) Web Authentication
// Configuration (Primary App ID, domains, return URL) has been re-verified saved correctly
// via desktop-site mode after the mobile-site "tag" inputs were silently failing to persist.
// If Apple's invalid_client error resurfaces, that's a sign this genuinely still needs more
// propagation time on Apple's end rather than another config change.
const APPLE_SIGNIN_ENABLED = true;

type Tab = "account" | "about";

const THEME_OPTIONS: { value: WebSettings["theme"]; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "☀️ Light" },
  { value: "dark", label: "🌙 Dark" },
];

// Small background/highway-accent pair per theme, just for the picker swatches below -- the
// real, full styling lives in utils/mapStyles.ts; this is only a preview.
const MAP_THEME_ORDER: MapThemeKey[] = ["normal", "purpleBlue", "blueGrey", "greenYellow"];
const MAP_THEME_SWATCH_COLORS: Record<MapThemeKey, [string, string]> = {
  normal: ["#14201a", "#34d976"],
  purpleBlue: ["#1a1033", "#8b7cf6"],
  blueGrey: ["#232a35", "#5b9bf0"],
  greenYellow: ["#0f2417", "#facc15"],
};

interface Props {
  theme: WebSettings["theme"];
  onSetTheme: (theme: WebSettings["theme"]) => void;
  mapTheme: MapThemeKey;
  onSetMapTheme: (mapTheme: MapThemeKey) => void;
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
  mapTheme,
  onSetMapTheme,
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
  // Account (sign-in/admin) opens by default -- that's what a "menu" button is for; app
  // branding/version/legal links move to a second tab instead of being the first thing shown.
  const [tab, setTab] = useState<Tab>("account");

  return (
    <div className="about-panel">
      <div className="about-tabs">
        <button className={tab === "account" ? "about-tab-active" : ""} onClick={() => setTab("account")}>
          Account
        </button>
        <button className={tab === "about" ? "about-tab-active" : ""} onClick={() => setTab("about")}>
          About
        </button>
      </div>

      {tab === "account" && (
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
              {APPLE_SIGNIN_ENABLED && (
                <button className="account-signin-button account-signin-apple" onClick={onSignInApple}>
                  Continue with Apple
                </button>
              )}
              <button className="account-signin-button" onClick={onSignInPhone}>
                Continue with phone
              </button>
            </>
          )}

          {isAdmin && (
            <>
              <div className="admin-tab-divider" />
              <div className="admin-tab-label">Administrator</div>
              <button className="account-signin-button admin-tab-button" onClick={onOpenAdmin}>
                View sign-in history
              </button>
            </>
          )}
        </div>
      )}

      {tab === "about" && (
        <div className="about-tab-content">
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

          <div className="map-theme-label">Map colors</div>
          <div className="map-theme-grid">
            {MAP_THEME_ORDER.map((key) => {
              const [bg, accent] = MAP_THEME_SWATCH_COLORS[key];
              const isSelected = mapTheme === key;
              return (
                <button
                  key={key}
                  className={`map-theme-tile${isSelected ? " map-theme-tile-selected" : ""}`}
                  onClick={() => onSetMapTheme(key)}
                  aria-label={`${MAP_THEME_LABELS[key]} map theme`}
                >
                  <span className="map-theme-swatch" style={{ background: bg }}>
                    <span className="map-theme-swatch-accent" style={{ background: accent }} />
                  </span>
                  <span className="map-theme-tile-label">{MAP_THEME_LABELS[key]}</span>
                </button>
              );
            })}
          </div>

          <div className="about-legal-links">
            <a href="/help.html" target="_blank" rel="noopener">
              Help
            </a>
            <a href="/support.html" target="_blank" rel="noopener">
              Support
            </a>
            <a href="/privacy.html" target="_blank" rel="noopener">
              Privacy
            </a>
          </div>
        </div>
      )}

      <button className="about-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
