import { requireNativeViewManager } from "expo-modules-core";
import { forwardRef, useImperativeHandle, useRef, type ComponentType, type Ref } from "react";
import { Platform, type ViewStyle } from "react-native";

// Both platforms have real native implementations (see ../android and ../ios), but iOS is
// disabled here for now: Google's Maps 3D SDK for iOS is still Experimental/pre-GA, ships via
// a Swift Package Manager mechanism with a documented "works in the simulator, crashes on a
// real device" gotcha (see README.md's "iOS-specific risk" section), and was never actually
// verified on a physical iOS device before shipping to TestFlight -- this app's whole crash
// investigation this session was hard enough to want a second, unverified native crash
// surface live at the same time. Re-enable for iOS only after confirming it doesn't crash on
// a real device via a development build first, per the README's own recommendation.
export const isMap3DSupported = Platform.OS === "android";

export interface Map3DViewHandle {
  rotate: (deltaDeg: number) => void;
  tilt: (deltaDeg: number) => void;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

interface NativeMap3DViewRef {
  rotateCamera: (deltaDeg: number) => void;
  tiltCamera: (deltaDeg: number) => void;
}

interface NativeProps {
  style?: ViewStyle;
  center: LatLng;
  mapMode?: "HYBRID" | "SATELLITE";
  markerPosition?: LatLng;
  routeCoordinates?: LatLng[];
  onStatusChange?: (event: { nativeEvent: { isSteady: boolean } }) => void;
}

// Only resolves once this module has been compiled into a dev/prod build via
// `expo prebuild` + EAS Build -- not available in Expo Go. Never referenced on iOS (guarded
// by isMap3DSupported), so it's fine that there's no native "Map3D" view registered there.
const NativeMap3DView: ComponentType<NativeProps & { ref?: Ref<NativeMap3DViewRef> }> | null =
  isMap3DSupported ? requireNativeViewManager("Map3D") : null;

export interface Map3DViewProps {
  center: LatLng;
  mapMode?: "HYBRID" | "SATELLITE";
  markerPosition?: LatLng;
  routeCoordinates?: LatLng[];
  onSteadyChange?: (isSteady: boolean) => void;
  style?: ViewStyle;
}

// Real photorealistic 3D satellite tiles via Google's Maps 3D SDK for Android -- the mobile
// counterpart of web/src/components/Map3DView.tsx, built for the same reason: flat
// satellite/hybrid raster imagery warps/squashes when tilted, since it has no real
// building-height data behind the photo. This wraps real mesh-based 3D terrain/buildings
// that tilt cleanly instead.
//
// Stage 1 scope, matching the web build: camera + live position marker + the active route
// polyline only. No traffic-light/speed-camera/alert overlays yet.
export const Map3DView = forwardRef<Map3DViewHandle, Map3DViewProps>(function Map3DView(
  { center, mapMode, markerPosition, routeCoordinates, onSteadyChange, style },
  ref
) {
  const nativeRef = useRef<NativeMap3DViewRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      rotate: (deltaDeg: number) => nativeRef.current?.rotateCamera(deltaDeg),
      tilt: (deltaDeg: number) => nativeRef.current?.tiltCamera(deltaDeg),
    }),
    []
  );

  if (!NativeMap3DView) return null;

  return (
    <NativeMap3DView
      ref={nativeRef}
      style={style}
      center={center}
      mapMode={mapMode ?? "HYBRID"}
      markerPosition={markerPosition}
      routeCoordinates={routeCoordinates}
      onStatusChange={(event) => onSteadyChange?.(event.nativeEvent.isSteady)}
    />
  );
});
