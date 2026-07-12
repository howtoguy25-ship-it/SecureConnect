import { BUSINESS_INFO } from "@/config/business";
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
  onClose: () => void;
}

export function AboutPanel({ theme, onSetTheme, onClose }: Props) {
  return (
    <div className="about-panel">
      <img src="/logo.png" alt="TrackLive" className="about-logo" />
      <div className="about-name">TrackLive</div>
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

      <button className="about-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
