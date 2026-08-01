import { useEffect, useRef } from "react";
import {
  ROUTE_ORDER,
  ROUTE_PROFILES,
  TRAVEL_MODE_ORDER,
  TRAVEL_MODE_LABELS,
  TRAVEL_MODE_ICONS,
  type RouteKey,
  type TravelMode,
} from "@/utils/routeProfiles";
import "./RouteOptionsCard.css";

interface Props {
  routeOptions: Record<RouteKey, google.maps.DirectionsResult | null>;
  selectedRouteKey: RouteKey;
  onSelect: (key: RouteKey) => void;
  // Real, independently-fetched Google Directions results per non-driving mode -- see
  // App.tsx's directions-fetch effect -- not driving-time estimates scaled by a guessed
  // walking/cycling speed.
  travelMode: TravelMode;
  onSelectTravelMode: (mode: TravelMode) => void;
  modeRoute: google.maps.DirectionsResult | null;
  onStart: () => void;
  onClear: () => void;
  // Real measured card height, so the caller can fit the previewed route above it instead of
  // guessing a fixed bottom padding this card (3 route options + Start button) can grow taller
  // than.
  onHeightChange?: (height: number) => void;
}

export function RouteOptionsCard({
  routeOptions,
  selectedRouteKey,
  onSelect,
  travelMode,
  onSelectTravelMode,
  modeRoute,
  onStart,
  onClear,
  onHeightChange,
}: Props) {
  const isDriving = travelMode === "driving";
  const available = ROUTE_ORDER.filter((key) => routeOptions[key]);
  const selectedLeg = isDriving
    ? routeOptions[selectedRouteKey]?.routes[0]?.legs[0]
    : modeRoute?.routes[0]?.legs[0];

  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || !onHeightChange) return;
    onHeightChange(el.getBoundingClientRect().height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) onHeightChange(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Previously, picking a route option also slid this whole card partway down ("peek", to show
  // more of the map) and back up a few seconds later. Removed entirely -- that slide-back-up
  // firing while someone was mid-scroll toward the Start button (exactly when picking a route
  // makes you want to scroll to it) visually fought the scroll and could read as "I scroll down
  // and it flings back up." The card's own overflow-y: auto (see RouteOptionsCard.css) is what
  // actually needs to guarantee Start stays reachable.
  return (
    <div ref={cardRef} className="route-options-card">
      <div className="route-options-header">
        <span>Choose a route</span>
        <button className="route-options-clear" onClick={onClear} aria-label="Remove route">
          ✕
        </button>
      </div>
      {/* Real, independently-fetched Google Directions results per mode -- see App.tsx's
          directions-fetch effect -- not driving-time estimates scaled by a guessed
          walking/cycling speed. */}
      <div className="route-mode-row">
        {TRAVEL_MODE_ORDER.map((mode) => (
          <button
            key={mode}
            className={`route-mode-button ${mode === travelMode ? "route-mode-button-active" : ""}`}
            onClick={() => onSelectTravelMode(mode)}
            aria-label={`${TRAVEL_MODE_LABELS[mode]} directions`}
          >
            <span className="route-mode-icon">{TRAVEL_MODE_ICONS[mode]}</span>
            <span>{TRAVEL_MODE_LABELS[mode]}</span>
          </button>
        ))}
      </div>
      <div className="route-options-list">
        {isDriving
          ? available.map((key) => {
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
                    {/* duration_in_traffic (live, requested via drivingOptions in App.tsx) over
                        plain duration (static/typical-conditions) whenever Google actually
                        returned it -- otherwise this shows an honest-looking number that's
                        quietly ignoring current traffic entirely. */}
                    <span className="route-option-eta">
                      {leg?.duration_in_traffic?.text ?? leg?.duration?.text ?? "—"}
                    </span>
                  </div>
                  <div className="route-option-subtitle">
                    {profile.subtitle} · {leg?.distance?.text ?? ""}
                  </div>
                </button>
              );
            })
          : modeRoute && (
              // A single mode has exactly one meaningful route in the overwhelming majority of
              // cases (transit especially -- it's governed by real timetables, not alternative
              // road choices), so this is a summary row instead of a 3-way picker.
              <div className="route-option-row route-option-selected route-option-static">
                <div className="route-option-title">
                  <span className="route-option-label">{TRAVEL_MODE_LABELS[travelMode]}</span>
                  <span className="route-option-eta">{selectedLeg?.duration?.text ?? "—"}</span>
                </div>
                <div className="route-option-subtitle">
                  Real-time Google Directions estimate · {selectedLeg?.distance?.text ?? ""}
                </div>
              </div>
            )}
      </div>
      <button className="start-nav-button" onClick={onStart} disabled={!selectedLeg}>
        Start navigation · ETA {selectedLeg?.duration_in_traffic?.text ?? selectedLeg?.duration?.text ?? "…"}
      </button>
    </div>
  );
}
