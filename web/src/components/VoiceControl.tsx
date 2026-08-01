import { useState } from "react";
import "./VoiceControl.css";

interface Props {
  enabled: boolean;
  volume: number;
  onToggleEnabled: () => void;
  onSetVolume: (volume: number) => void;
}

// Floating mute/volume control, shown only during navigation (voice guidance only ever speaks
// then). Click the icon to mute/unmute; while unmuted, a small popover slider sets the volume --
// collapsed by default so it doesn't just sit open over the map the whole drive.
export function VoiceControl({ enabled, volume, onToggleEnabled, onSetVolume }: Props) {
  const [sliderOpen, setSliderOpen] = useState(false);

  return (
    <div className="voice-control">
      {sliderOpen && enabled && (
        <div className="voice-control-slider-popover">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => onSetVolume(Number(e.target.value))}
            aria-label="Voice guidance volume"
          />
        </div>
      )}
      <button
        className="fab fab-quaternary voice-control-button"
        onClick={onToggleEnabled}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (enabled) setSliderOpen((v) => !v);
        }}
        aria-label={enabled ? "Mute voice guidance (double-click for volume)" : "Unmute voice guidance"}
        title={enabled ? "Mute voice guidance (double-click for volume)" : "Unmute voice guidance"}
      >
        {enabled ? "🔊" : "🔇"}
      </button>
    </div>
  );
}
