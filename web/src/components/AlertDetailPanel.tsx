import { ALERT_COLORS, ALERT_EMOJI, ALERT_LABELS, type AlertDoc } from "@/types/alert";
import "./ReportAlertPanel.css";
import "./AlertDetailPanel.css";

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

// Renders a small static satellite/road thumbnail centered on the alert via the Maps
// Static API — needs "Maps Static API" enabled on the same key as the rest of the app.
function staticMapUrl(lat: number, lng: number, color: string): string {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "16",
    size: "480x180",
    scale: "2",
    maptype: "roadmap",
    markers: `color:0x${color.replace("#", "")}|${lat},${lng}`,
    key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
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
  const color = ALERT_COLORS[alert.type];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet detail-sheet" onClick={(e) => e.stopPropagation()}>
        <img
          className="detail-map-thumb"
          src={staticMapUrl(alert.lat, alert.lng, color)}
          alt={`Map centered on the ${ALERT_LABELS[alert.type]} report location`}
        />

        <div className="detail-header" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <span className="detail-icon">{ALERT_EMOJI[alert.type]}</span>
          <div>
            <div className="detail-title">{ALERT_LABELS[alert.type]}</div>
            <div className="detail-subtitle">
              Reported {timeAgo(alert.createdAt)} · {alert.confirmCount} confirmed
            </div>
          </div>
        </div>

        <div className="detail-body">
          {/* The reporter's own optional "up to 7 words" comment (see utils/commentFilter.ts) --
              shown in full here, mirroring the mobile app's own detail sheet. */}
          {alert.comment && <div className="detail-comment">"{alert.comment}"</div>}

          <button className="confirm-button" onClick={() => onConfirmStillHere(alert)}>
            Still here
          </button>

          {isOwner ? (
            <button className="delete-button" onClick={() => onDelete(alert)}>
              Delete
            </button>
          ) : (
            <button className="hide-button" onClick={() => onHide(alert)}>
              Hide for 1 hour
            </button>
          )}

          <button className="close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
