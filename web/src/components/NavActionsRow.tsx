import "./NavActionsRow.css";

interface Props {
  hasStop: boolean;
  onAddStop: () => void;
  onShareEta: () => void;
  onReportAlert: () => void;
  onOpenDetection?: () => void;
}

export function NavActionsRow({ hasStop, onAddStop, onShareEta, onReportAlert, onOpenDetection }: Props) {
  return (
    <div className="nav-actions-row">
      <button onClick={onAddStop}>
        <span className="nav-action-icon">{hasStop ? "✕" : "➕"}</span>
        <span>{hasStop ? "Remove Stop" : "Add Stop"}</span>
      </button>
      <button onClick={onShareEta}>
        <span className="nav-action-icon">📤</span>
        <span>Share ETA</span>
      </button>
      <button onClick={onReportAlert}>
        <span className="nav-action-icon">⚠️</span>
        <span>Report</span>
      </button>
      {onOpenDetection && (
        <button onClick={onOpenDetection}>
          <span className="nav-action-icon">🎥</span>
          <span>AI Detection</span>
        </button>
      )}
    </div>
  );
}
