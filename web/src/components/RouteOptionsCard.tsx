import { ROUTE_ORDER, ROUTE_PROFILES, type RouteKey } from "@/utils/routeProfiles";
import "./RouteOptionsCard.css";

interface Props {
  routeOptions: Record<RouteKey, google.maps.DirectionsResult | null>;
  selectedRouteKey: RouteKey;
  onSelect: (key: RouteKey) => void;
  onStart: () => void;
  onClear: () => void;
}

export function RouteOptionsCard({ routeOptions, selectedRouteKey, onSelect, onStart, onClear }: Props) {
  const available = ROUTE_ORDER.filter((key) => routeOptions[key]);
  const selectedLeg = routeOptions[selectedRouteKey]?.routes[0]?.legs[0];

  return (
    <div className="route-options-card">
      <div className="route-options-header">
        <span>Choose a route</span>
        <button className="route-options-clear" onClick={onClear} aria-label="Remove route">
          ✕
        </button>
      </div>
      <div className="route-options-list">
        {available.map((key) => {
          const leg = routeOptions[key]?.routes[0]?.legs[0];
          const profile = ROUTE_PROFILES[key];
          return (
            <button
              key={key}
              className={`route-option-row ${key === selectedRouteKey ? "route-option-selected" : ""}`}
              onClick={() => onSelect(key)}
            >
              <div className="route-option-title">
                <span className="route-option-label">{profile.label}</span>
                <span className="route-option-eta">{leg?.duration?.text ?? "—"}</span>
              </div>
              <div className="route-option-subtitle">
                {profile.subtitle} · {leg?.distance?.text ?? ""}
              </div>
            </button>
          );
        })}
      </div>
      <button className="start-nav-button" onClick={onStart} disabled={!selectedLeg}>
        Start navigation · ETA {selectedLeg?.duration?.text ?? "…"}
      </button>
    </div>
  );
}
