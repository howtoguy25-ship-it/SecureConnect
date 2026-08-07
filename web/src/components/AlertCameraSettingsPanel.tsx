import type { WebSettings } from "@/hooks/useSettings";
import { AU_STATES, type AuRegionCode } from "@/utils/auStates";
import { ALL_ALERT_TYPES } from "@/hooks/useSettings";
import { ALERT_LABELS, type AlertType } from "@/types/alert";
import "./AlertCameraSettingsPanel.css";

// Real, applied durations -- selecting one of these writes straight into settings.alertExpiryMs,
// which services/alerts.ts's reportAlert then uses as the real Firestore expiresAt for any alert
// this device reports, replacing the app's own per-type default (types/alert.ts's ALERT_TTL_MS)
// for as long as it's set. "Default" (null) reverts to that original per-type behavior. Mirrors
// mobile's SettingsScreen.tsx EXPIRY_PRESETS exactly.
const EXPIRY_PRESETS: { label: string; ms: number | null }[] = [
  { label: "Default", ms: null },
  { label: "12 hours", ms: 12 * 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];

function formatExpiryMs(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

interface Props {
  settings: WebSettings;
  setAlertsEnabled: (value: boolean) => void;
  onRegionToggle: (code: AuRegionCode, value: boolean) => void;
  onAlertTypeToggle: (type: AlertType, value: boolean) => void;
  onExpiryPresetSelect: (ms: number | null) => void;
  customExpiryOpen: boolean;
  setCustomExpiryOpen: (updater: (v: boolean) => boolean) => void;
  customHoursText: string;
  setCustomHoursText: (value: string) => void;
  customMinutesText: string;
  setCustomMinutesText: (value: string) => void;
  onApplyCustomExpiry: () => void;
  setShowTrafficLights: (value: boolean) => void;
  setShowSpeedCameras: (value: boolean) => void;
  setOsmLayerRadiusKm: (value: number) => void;
  trafficLightIconUrl: string;
  speedCameraIconUrl: string;
}

// Real "Alert & camera settings" content, moved here from floating directly on top of the map
// into a proper Settings tab (see AboutPanel.tsx) per explicit request -- same fields, same
// handlers, just a permanent home instead of a collapsible card competing with the map for
// space. Every prop is exactly what App.tsx already had wired for the old floating panel.
export function AlertCameraSettingsPanel({
  settings,
  setAlertsEnabled,
  onRegionToggle,
  onAlertTypeToggle,
  onExpiryPresetSelect,
  customExpiryOpen,
  setCustomExpiryOpen,
  customHoursText,
  setCustomHoursText,
  customMinutesText,
  setCustomMinutesText,
  onApplyCustomExpiry,
  setShowTrafficLights,
  setShowSpeedCameras,
  setOsmLayerRadiusKm,
  trafficLightIconUrl,
  speedCameraIconUrl,
}: Props) {
  return (
    <div className="alert-camera-settings">
      {/* Master on/off, matching mobile's Settings screen exactly -- off means no alerts shown/
          received at all, regardless of region. */}
      <label className="radius-checkbox">
        <input
          type="checkbox"
          checked={settings.alertsEnabled}
          onChange={(e) => setAlertsEnabled(e.target.checked)}
        />
        Receive alerts
      </label>
      {!settings.alertsEnabled && (
        <div className="radius-helper-text">Off — you won't see or receive any community alerts.</div>
      )}

      {/* Real Australian state/territory multi-select -- a driver sees every alert in every
          region toggled on, regardless of how far away it is. Matches mobile's own Settings
          screen exactly. */}
      <div className="radius-helper-text">Regions</div>
      <div className="radius-helper-text">
        Toggle on whichever real Australian states/territories you want to see alerts from --
        you'll see every alert in every region toggled on, regardless of how far away it is.
      </div>
      <div className="alert-type-grid">
        {AU_STATES.map((state) => (
          <label key={state.code} className="radius-checkbox alert-type-checkbox">
            <input
              type="checkbox"
              disabled={!settings.alertsEnabled}
              checked={settings.visibleRegions.includes(state.code as AuRegionCode)}
              onChange={(e) => onRegionToggle(state.code as AuRegionCode, e.target.checked)}
            />
            {state.label}
          </label>
        ))}
      </div>

      {/* Per-type visibility grid, matching mobile's Settings screen exactly. */}
      <div className="alert-type-grid">
        {ALL_ALERT_TYPES.map((type) => (
          <label key={type} className="radius-checkbox alert-type-checkbox">
            <input
              type="checkbox"
              disabled={!settings.alertsEnabled}
              checked={settings.visibleAlertTypes.includes(type)}
              onChange={(e) => onAlertTypeToggle(type, e.target.checked)}
            />
            {ALERT_LABELS[type]}
          </label>
        ))}
      </div>

      {/* Real, applied override for how long an alert THIS device reports stays live before it
          auto-expires -- matches mobile's Settings screen exactly. */}
      <div className="radius-helper-text">
        Alert lifetime — {settings.alertExpiryMs === null ? "Default" : formatExpiryMs(settings.alertExpiryMs)}
      </div>
      <div className="expiry-chip-row">
        {EXPIRY_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={`expiry-chip${settings.alertExpiryMs === preset.ms ? " expiry-chip-selected" : ""}`}
            onClick={() => onExpiryPresetSelect(preset.ms)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`expiry-chip${customExpiryOpen ? " expiry-chip-selected" : ""}`}
          onClick={() => setCustomExpiryOpen((v) => !v)}
        >
          Custom
        </button>
      </div>
      {customExpiryOpen && (
        <div className="custom-expiry-row">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Hours"
            value={customHoursText}
            onChange={(e) => setCustomHoursText(e.target.value)}
            className="custom-expiry-input"
          />
          <input
            type="number"
            min={0}
            max={59}
            inputMode="numeric"
            placeholder="Minutes"
            value={customMinutesText}
            onChange={(e) => setCustomMinutesText(e.target.value)}
            className="custom-expiry-input"
          />
          <button type="button" className="custom-expiry-apply" onClick={onApplyCustomExpiry}>
            Apply
          </button>
        </div>
      )}

      <label className="radius-checkbox">
        <input
          type="checkbox"
          checked={settings.showTrafficLights}
          onChange={(e) => setShowTrafficLights(e.target.checked)}
        />
        <img src={trafficLightIconUrl} alt="" className="radius-checkbox-icon" />
        Show traffic lights
      </label>
      <label className="radius-checkbox">
        <input
          type="checkbox"
          checked={settings.showSpeedCameras}
          onChange={(e) => setShowSpeedCameras(e.target.checked)}
        />
        <img src={speedCameraIconUrl} alt="" className="radius-checkbox-icon" />
        Show speed cameras
      </label>
      <label>
        Traffic light &amp; speed camera radius: {settings.osmLayerRadiusKm} km
        <input
          type="range"
          min={1}
          max={200}
          disabled={!settings.showTrafficLights && !settings.showSpeedCameras}
          value={settings.osmLayerRadiusKm}
          onChange={(e) => setOsmLayerRadiusKm(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
