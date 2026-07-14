// Fixes a real Xcode archive error: "GoogleMaps3D.xcframework-ios.signature couldn't be
// copied to 'Signatures' because an item with the same name already exists." This happens
// because GoogleMaps3D is pulled in via Swift Package Manager (spm_dependency, see
// ../ios/Map3D.podspec) inside a CocoaPods pod -- Xcode ends up trying to embed/sign that
// xcframework's signature file from two places (nested under the Map3D pod's own product,
// and again at the top level), and the second copy collides with the first.
//
// This is a known, real issue (not specific to this app) -- confirmed via a merged fix in
// maplibre-react-native for the identical error with a different xcframework
// (https://github.com/maplibre/maplibre-react-native/pull/1490): add a Run Script build
// phase to the *app's own* Xcode target (not the pod's) that deletes the stale signature
// file before Xcode tries to copy the new one in, so there's nothing for it to collide with.
// Adapted here for GoogleMaps3D specifically.
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const POST_INSTALL_MARKER = "post_install do |installer|";

const SIGNATURE_FIX_SNIPPET = `
    # [map3d] Real Xcode archive fix for a known GoogleMaps3D (Swift Package Manager, pulled
    # in via spm_dependency in modules/map3d/ios/Map3D.podspec) signature-file collision.
    # See modules/map3d/plugin/withGoogleMaps3DSignatureFix.js for the full explanation.
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_targets.each do |user_target|
        phase_name = "[Map3D] Remove GoogleMaps3D.xcframework-ios.signature"
        next if user_target.shell_script_build_phases.any? { |p| p.name == phase_name }
        phase = user_target.new_shell_script_build_phase(phase_name)
        phase.shell_script = 'rm -rf "$CONFIGURATION_BUILD_DIR/GoogleMaps3D.xcframework-ios.signature"'
        phase.always_out_of_date = "1"
      end
    end
`;

function withGoogleMaps3DSignatureFix(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfilePath, "utf8");

      if (contents.includes("[Map3D] Remove GoogleMaps3D.xcframework-ios.signature")) {
        return config;
      }

      const markerIndex = contents.indexOf(POST_INSTALL_MARKER);
      if (markerIndex === -1) {
        // Expo's generated Podfile has always had a post_install block historically, but
        // fail loudly rather than silently no-op if that ever changes -- a silent no-op here
        // would mean this fix quietly stops applying with no signal why the build broke.
        throw new Error(
          "[map3d] Could not find 'post_install do |installer|' in the generated Podfile -- " +
            "the GoogleMaps3D signature-collision fix could not be inserted."
        );
      }

      const insertAt = markerIndex + POST_INSTALL_MARKER.length;
      contents = contents.slice(0, insertAt) + SIGNATURE_FIX_SNIPPET + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents);
      return config;
    },
  ]);
}

module.exports = withGoogleMaps3DSignatureFix;
