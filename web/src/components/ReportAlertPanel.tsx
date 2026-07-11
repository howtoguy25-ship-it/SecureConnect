import { ALERT_COLORS, ALERT_EMOJI, ALERT_LABELS, type AlertType } from "@/types/alert";
import "./ReportAlertPanel.css";

const ALERT_TYPES: AlertType[] = ["police", "emergency_vehicle", "hazard", "camera", "crash"];

interface Props {
  onShare: (type: AlertType) => void;
  onClose: () => void;
}

export function ReportAlertPanel({ onShare, onClose }: Props) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Report what you see</div>
        <div className="type-grid">
          {ALERT_TYPES.map((type) => (
            <button
              key={type}
              className="type-button"
              style={{ borderColor: ALERT_COLORS[type] }}
              onClick={() => onShare(type)}
            >
              <span className="type-emoji">{ALERT_EMOJI[type]}</span>
              <span>{ALERT_LABELS[type]}</span>
            </button>
          ))}
        </div>
        <button className="close-button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
