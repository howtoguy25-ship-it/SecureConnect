import "./SpeedLimitSign.css";

interface Props {
  kmh: number;
}

/** A real, static road sign readout -- not text overlaid on the camera/map, a standalone
 *  badge sitting in its own corner of the screen, matching how a physical speed-limit sign
 *  or Apple/Google Maps' own speed-limit badge presents the number. */
export function SpeedLimitSign({ kmh }: Props) {
  return (
    <div className="speed-limit-sign" aria-label={`Speed limit ${kmh} kilometers per hour`}>
      <div className="speed-limit-sign-label">LIMIT</div>
      <div className="speed-limit-sign-value">{kmh}</div>
    </div>
  );
}
