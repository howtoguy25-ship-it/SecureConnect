import { ALERT_LABELS, type AlertType } from "@/types/alert";
import "./PlacementBar.css";

interface Props {
  type: AlertType;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PlacementBar({ type, onConfirm, onCancel }: Props) {
  return (
    <div className="placement-bar">
      <div className="placement-text">
        Drag the pin or tap the map to place your <strong>{ALERT_LABELS[type]}</strong> report
      </div>
      <div className="placement-buttons">
        <button className="placement-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button className="placement-confirm" onClick={onConfirm}>
          Confirm location
        </button>
      </div>
    </div>
  );
}
