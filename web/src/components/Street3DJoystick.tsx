import { useCallback, useRef } from "react";
import "./Street3DJoystick.css";

interface Props {
  onRotate: (deltaDeg: number) => void;
  onTilt: (deltaDeg: number) => void;
}

const REPEAT_MS = 90;

export function Street3DJoystick({ onRotate, onTilt }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRepeating = useCallback((fn: () => void) => {
    fn();
    intervalRef.current = setInterval(fn, REPEAT_MS);
  }, []);

  const stopRepeating = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const holdProps = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      startRepeating(fn);
    },
    onPointerUp: stopRepeating,
    onPointerLeave: stopRepeating,
    onPointerCancel: stopRepeating,
  });

  return (
    <div className="street3d-joystick" aria-label="Look around in 3D">
      <button className="street3d-joystick-up" {...holdProps(() => onTilt(6))} aria-label="Look up">
        ▲
      </button>
      <button
        className="street3d-joystick-left"
        {...holdProps(() => onRotate(-8))}
        aria-label="Turn left"
      >
        ◀
      </button>
      <div className="street3d-joystick-center" />
      <button
        className="street3d-joystick-right"
        {...holdProps(() => onRotate(8))}
        aria-label="Turn right"
      >
        ▶
      </button>
      <button
        className="street3d-joystick-down"
        {...holdProps(() => onTilt(-6))}
        aria-label="Look down"
      >
        ▼
      </button>
    </div>
  );
}
