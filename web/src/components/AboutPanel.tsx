import { BUSINESS_INFO } from "@/config/business";
import "./AboutPanel.css";

const APP_VERSION = "1.0.0";

interface Props {
  onClose: () => void;
}

export function AboutPanel({ onClose }: Props) {
  return (
    <div className="about-panel">
      <img src="/logo.png" alt="TrackLive" className="about-logo" />
      <div className="about-name">TrackLive</div>
      <div className="about-version">Version {APP_VERSION}</div>
      {BUSINESS_INFO.businessName && <div className="about-meta">{BUSINESS_INFO.businessName}</div>}
      {BUSINESS_INFO.abn && <div className="about-meta">ABN {BUSINESS_INFO.abn}</div>}
      <button className="about-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
