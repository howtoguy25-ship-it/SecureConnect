import "./NavigationCard.css";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

interface Props {
  step: google.maps.DirectionsStep | null;
  etaText: string;
  distanceRemainingText: string;
  onExit: () => void;
}

export function NavigationCard({ step, etaText, distanceRemainingText, onExit }: Props) {
  return (
    <div className="nav-card">
      <div className="nav-card-instruction">
        {step ? stripHtml(step.instructions) : "Recalculating…"}
      </div>
      <div className="nav-card-meta">
        {step && `${step.distance?.text} · `}ETA {etaText} · {distanceRemainingText} remaining
      </div>
      <button className="nav-card-exit" onClick={onExit}>
        End navigation
      </button>
    </div>
  );
}
