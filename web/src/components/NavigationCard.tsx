import { stripHtml, formatDistance } from "@/utils/navFormat";
import { NavActionsRow } from "@/components/NavActionsRow";
import "./NavigationCard.css";

export type NavViewMode = "follow" | "street" | "overview";

interface Props {
  step: google.maps.DirectionsStep | null;
  distanceToManeuverM: number | null;
  etaText: string;
  distanceRemainingText: string;
  navViewMode: NavViewMode | null;
  onSetNavViewMode: (mode: NavViewMode) => void;
  onClearRoute: () => void;
  onExit: () => void;
  onCollapse: () => void;
  hasStop: boolean;
  onAddStop: () => void;
  onShareEta: () => void;
  onReportAlert: () => void;
  onOpenDetection: () => void;
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
  onCollapse,
  hasStop,
  onAddStop,
  onShareEta,
  onReportAlert,
  onOpenDetection,
}: Props) {
  const instruction = step ? stripHtml(step.instructions) : "Recalculating…";
  const headline =
    step && distanceToManeuverM !== null
      ? `In ${formatDistance(distanceToManeuverM)}, ${instruction}`
      : instruction;

  return (
    <div className="nav-card">
      <button
        className="nav-card-collapse"
        onClick={onCollapse}
        aria-label="Hide turn-by-turn card"
        title="Hide (shows a small direction pill instead)"
      >
        ⌄
      </button>
      <button className="nav-card-clear" onClick={onClearRoute} aria-label="Remove route">
        ✕
      </button>
      {/* Keyed on the raw instruction text (not `headline`, which also changes with distance
          on every GPS tick) so this block only actually remounts -- and its slide-in animation
          only actually replays -- when the active step itself changes. */}
      <div key={instruction} className="nav-card-instruction-block">
        <div className="nav-card-instruction">{headline}</div>
        <div className="nav-card-meta">
          ETA {etaText} · {distanceRemainingText} remaining
        </div>
      </div>

      <NavActionsRow
        hasStop={hasStop}
        onAddStop={onAddStop}
        onShareEta={onShareEta}
        onReportAlert={onReportAlert}
        onOpenDetection={onOpenDetection}
      />

      {navViewMode === null && <div className="nav-card-view-hint">Choose a driving view</div>}
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
