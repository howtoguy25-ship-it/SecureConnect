import "./NavigationCard.css";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export type NavViewMode = "follow" | "street" | "overview";

interface Props {
  step: google.maps.DirectionsStep | null;
  distanceToManeuverM: number | null;
  etaText: string;
  distanceRemainingText: string;
  navViewMode: NavViewMode;
  onSetNavViewMode: (mode: NavViewMode) => void;
  onClearRoute: () => void;
  onExit: () => void;
}

export function NavigationCard({
  step,
  distanceToManeuverM,
  etaText,
  distanceRemainingText,
  navViewMode,
  onSetNavViewMode,
  onClearRoute,
  onExit,
}: Props) {
  const instruction = step ? stripHtml(step.instructions) : "Recalculating…";
  const headline =
    step && distanceToManeuverM !== null
      ? `In ${formatDistance(distanceToManeuverM)}, ${instruction}`
      : instruction;

  return (
    <div className="nav-card">
      <button className="nav-card-clear" onClick={onClearRoute} aria-label="Remove route">
        ✕
      </button>
      <div className="nav-card-instruction">{headline}</div>
      <div className="nav-card-meta">
        ETA {etaText} · {distanceRemainingText} remaining
      </div>
      <div className="nav-card-view-toggle">
        <button
          className={navViewMode === "follow" ? "nav-view-active" : ""}
          onClick={() => onSetNavViewMode("follow")}
        >
          3D Follow
        </button>
        <button
          className={navViewMode === "street" ? "nav-view-active" : ""}
          onClick={() => onSetNavViewMode("street")}
        >
          Street View
        </button>
        <button
          className={navViewMode === "overview" ? "nav-view-active" : ""}
          onClick={() => onSetNavViewMode("overview")}
        >
          Full Route
        </button>
      </div>
      <button className="nav-card-exit" onClick={onExit}>
        End navigation
      </button>
    </div>
  );
}
