import { useEffect, useState } from "react";
import { Circle } from "@react-google-maps/api";

interface Props {
  center: google.maps.LatLngLiteral;
}

// The destination-highlight pulse used to be driven by a tick counter living on the
// top-level App component, re-rendering every ~150ms during navigation -- App is a large,
// heavily-stateful component, so that re-render cascaded into reconciling everything else
// under it too, including up to ~6000 traffic-light/speed-camera <Marker> elements. Moving
// the tick state down into this small, isolated component (rendered as a child of
// <GoogleMap>, same as before -- Circle needs that context to attach to the map) means the
// 150ms re-render now only touches this one component and its single <Circle>.
export function DestinationPulseCircle({ center }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 150);
    return () => clearInterval(id);
  }, []);

  const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 450);

  return (
    <Circle
      center={center}
      radius={16 + pulse * 8}
      options={{
        strokeColor: "#16A34A",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        fillColor: "#16A34A",
        fillOpacity: 0.12 + pulse * 0.14,
        clickable: false,
      }}
    />
  );
}
