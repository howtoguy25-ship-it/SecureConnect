import "./NavigationCard.css";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface Props {
  step: google.maps.DirectionsStep | null;
  distanceToManeuverM: number | null;
  etaText: string;
  distanceRemainingText: string;
  onExit: () => void;
}

export function NavigationCard({
  step,
  distanceToManeuverM,
  etaText,
  distanceRemainingText,
  onExit,
}: Props) {
  const instruction = step ? stripHtml(step.instructions) : "Recalculating…";
  const headline =
    step && distanceToManeuverM !== null
      ? `In ${formatDistance(distanceToManeuverM)}, ${instruction}`
      : instruction;

  return (
    <div className="nav-card">
      <div className="nav-card-instruction">{headline}</div>
      <div className="nav-card-meta">
        ETA {etaText} · {distanceRemainingText} remaining
      </div>
      <button className="nav-card-exit" onClick={onExit}>
        End navigation
      </button>
    </div>
  );
}
