import { stripHtml, formatDistance } from "@/utils/navFormat";
import "./NavMiniBox.css";

interface Props {
  step: google.maps.DirectionsStep | null;
  distanceToManeuverM: number | null;
  etaText: string;
  onExpand: () => void;
}

// The collapsed form of NavigationCard -- a compact pill that keeps the one thing you
// actually need mid-drive (the next turn) on screen without the ETA/action-row/view-toggle/
// end-nav button eating up real estate, especially over the real 3D satellite view.
export function NavMiniBox({ step, distanceToManeuverM, etaText, onExpand }: Props) {
  const instruction = step ? stripHtml(step.instructions) : "Recalculating…";
  const headline =
    step && distanceToManeuverM !== null ? `${formatDistance(distanceToManeuverM)} — ${instruction}` : instruction;

  return (
    <button className="nav-mini-box" onClick={onExpand} aria-label="Show full navigation card">
      <span className="nav-mini-box-arrow">↑</span>
      {/* Keyed on the raw instruction (not `headline`, which also changes with distance every
          GPS tick) so the slide-in animation only replays when the active step itself changes. */}
      <span key={instruction} className="nav-mini-box-text">
        {headline}
      </span>
      <span className="nav-mini-box-eta">{etaText}</span>
    </button>
  );
}
