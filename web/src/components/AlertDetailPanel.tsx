import { ALERT_COLORS, ALERT_EMOJI, ALERT_LABELS, type AlertDoc } from "@/types/alert";
import "./ReportAlertPanel.css";

interface Props {
  alert: AlertDoc;
  currentUid: string | null;
  onDelete: (alert: AlertDoc) => void;
  onHide: (alert: AlertDoc) => void;
  onConfirmStillHere: (alert: AlertDoc) => void;
  onClose: () => void;
}

function timeAgo(timestampMs: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - timestampMs) / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const hours = Math.round(diffMin / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

export function AlertDetailPanel({
  alert,
  currentUid,
  onDelete,
  onHide,
  onConfirmStillHere,
  onClose,
}: Props) {
  const isOwner = !!currentUid && alert.createdBy === currentUid;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <span className="detail-icon" style={{ backgroundColor: ALERT_COLORS[alert.type] }}>
            {ALERT_EMOJI[alert.type]}
          </span>
          <div>
            <div className="detail-title">{ALERT_LABELS[alert.type]}</div>
            <div className="detail-subtitle">
              Reported {timeAgo(alert.createdAt)} · {alert.confirmCount} confirmed
            </div>
          </div>
        </div>

        <button className="confirm-button" onClick={() => onConfirmStillHere(alert)}>
          Still here
        </button>

        {isOwner ? (
          <button className="delete-button" onClick={() => onDelete(alert)}>
            Delete
          </button>
        ) : (
          <button className="hide-button" onClick={() => onHide(alert)}>
            Hide
          </button>
        )}

        <button className="close-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
