import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { BUSINESS_INFO } from "@/config/business";
import { ADMIN_EMAILS, ADMIN_PHONE_NUMBERS } from "@/config/admin";
import type { WebSettings } from "@/hooks/useSettings";
import { MAP_THEME_LABELS, type MapThemeKey } from "@/utils/mapStyles";
import { getRevCheckProviderConfig, saveRevCheckProviderConfig } from "@/services/revCheckAdmin";
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

  // Real, shared provider credentials (Firestore config/revCheckProvider) -- mirrors mobile's
  // owner-only Settings section exactly, see revCheckAdmin.ts. Only the mobile app actually
  // runs a paid check against this (no web payment flow), but the owner can manage the key
  // from either platform since it's the same Firestore doc either way.
  const [ppsrKeyDraft, setPpsrKeyDraft] = useState("");
  const [nevdisKeyDraft, setNevdisKeyDraft] = useState("");
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [keysSavedFlash, setKeysSavedFlash] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getRevCheckProviderConfig()
      .then((config) => {
        if (cancelled) return;
        setPpsrKeyDraft(config.ppsrApiKey);
        setNevdisKeyDraft(config.nevdisApiKey);
      })
      .catch((err) => console.warn("[about] failed to load REV check provider config", err))
      .finally(() => {
        if (!cancelled) setKeysLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const onSaveRevCheckKeys = async () => {
    setSavingKeys(true);
    try {
      await saveRevCheckProviderConfig({ ppsrApiKey: ppsrKeyDraft, nevdisApiKey: nevdisKeyDraft });
      setKeysSavedFlash(true);
      setTimeout(() => setKeysSavedFlash(false), 2000);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Couldn't save -- something went wrong.");
    } finally {
      setSavingKeys(false);
    }
  };

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

              {/* Owner-only, per explicit request -- a real, paid business API credential, not
                  something any other signed-in user should ever be able to see or edit. Stored
                  in Firestore (config/revCheckProvider), shared with the mobile app's own
                  owner-only Settings section -- see revCheckAdmin.ts's header. */}
              <div className="admin-tab-label">Provider keys (owner only)</div>
              <div className="account-prompt">
                Real vehicle history isn't free -- PPSR (stolen/written-off/money-owing) and
                NEVDIS (registration + odometer history) both require your own signed-up broker
                account. Paste your keys below once you have them; every user's check stays
                clearly marked "not connected" until then. Saved to Firestore, never bundled into
                either app, and only ever readable by your own signed-in account or the
                server-side check function.
              </div>
              {!keysLoaded ? (
                <div className="account-prompt">Loading…</div>
              ) : (
                <>
                  <input
                    className="rev-check-key-input"
                    type="password"
                    value={ppsrKeyDraft}
                    onChange={(e) => setPpsrKeyDraft(e.target.value)}
                    placeholder="PPSR provider API key"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <input
                    className="rev-check-key-input"
                    type="password"
                    value={nevdisKeyDraft}
                    onChange={(e) => setNevdisKeyDraft(e.target.value)}
                    placeholder="NEVDIS provider API key"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button className="account-signin-button admin-tab-button" onClick={onSaveRevCheckKeys} disabled={savingKeys}>
                    {savingKeys ? "Saving…" : keysSavedFlash ? "Saved ✓" : "Save provider keys"}
                  </button>
                </>
              )}
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
