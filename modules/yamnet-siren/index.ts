import { requireNativeModule } from "expo-modules-core";

// Only resolves once this module has been compiled into a dev/prod build via
// `expo prebuild` + EAS Build — see README.md. Not available in Expo Go.
export default requireNativeModule("YamnetSiren");
