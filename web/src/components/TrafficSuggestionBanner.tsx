import "./TrafficSuggestionBanner.css";

interface Props {
  top: number;
  savedMinutes: number;
  onAccept: () => void;
  onDismiss: () => void;
}

// Real traffic-jam reroute suggestion -- only ever shown once App.tsx's periodic traffic
// check has actually found a genuinely faster side-streets alternative during a real traffic
// delay. Semi-transparent "island" tab per explicit request (not opaque, not so transparent
// it's hard to read); App.tsx auto-dismisses it after TRAFFIC_SUGGESTION_DISPLAY_MS if left
// untouched. Three distinct real controls: Yes (accept), No (decline), and a separate X close
// -- No and the X both just call onDismiss, kept as separate elements because that's what was
// explicitly asked for. Mirrors mobile's own banner.
export function TrafficSuggestionBanner({ top, savedMinutes, onAccept, onDismiss }: Props) {
  return (
    <div className="traffic-suggestion-banner" style={{ top }}>
      <div className="traffic-suggestion-top-row">
        <div className="traffic-suggestion-icon">⚡</div>
        <div className="traffic-suggestion-text">
          <div className="traffic-suggestion-title">Heavy traffic ahead</div>
          <div className="traffic-suggestion-body">Faster via side streets -- save {savedMinutes} min</div>
        </div>
        <button className="traffic-suggestion-close" onClick={onDismiss} aria-label="Close -- not wanted, keep current route">
          ✕
        </button>
      </div>
      <div className="traffic-suggestion-action-row">
        <button className="traffic-suggestion-no" onClick={onDismiss}>
          No
        </button>
        <button className="traffic-suggestion-yes" onClick={onAccept}>
          ✓ Yes
        </button>
      </div>
    </div>
  );
}

interface EndSuggestedRouteProps {
  top: number;
  onEnd: () => void;
}

// Only shown while actually driving an accepted suggestion (see acceptedSuggestionOriginalRoute
// in App.tsx), per explicit request. Restores the exact route the driver was on before they
// accepted.
export function EndSuggestedRouteButton({ top, onEnd }: EndSuggestedRouteProps) {
  return (
    <div className="end-suggested-route-wrap" style={{ top }}>
      <button className="end-suggested-route-button" onClick={onEnd}>
        ↩ End suggested route
      </button>
    </div>
  );
}
