import { useState } from "react";
import { ALERT_COLORS, ALERT_EMOJI, ALERT_LABELS, type AlertType } from "@/types/alert";
import "./ReportAlertPanel.css";

const ALERT_TYPES: AlertType[] = ["police", "emergency_vehicle", "hazard", "camera", "crash"];

interface Props {
  onPlaceOnMap: (type: AlertType) => void;
  onClose: () => void;
}

export function ReportAlertPanel({ onPlaceOnMap, onClose }: Props) {
  const [selected, setSelected] = useState<AlertType | null>(null);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Report what you see</div>
        <div className="type-grid">
          {ALERT_TYPES.map((type) => {
            const isSelected = selected === type;
            return (
              <button
                key={type}
                className={`type-button${isSelected ? " type-button-selected" : ""}`}
                style={{
                  borderColor: ALERT_COLORS[type],
                  backgroundColor: isSelected ? `${ALERT_COLORS[type]}22` : "#fff",
                }}
                onClick={() => setSelected(type)}
              >
                <span className="type-emoji">{ALERT_EMOJI[type]}</span>
                <span>{ALERT_LABELS[type]}</span>
              </button>
            );
          })}
        </div>

        <button
          className="place-button"
          disabled={!selected}
          onClick={() => selected && onPlaceOnMap(selected)}
        >
          {selected ? `Place ${ALERT_LABELS[selected]} on map` : "Select a type first"}
        </button>

        <button className="close-button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
