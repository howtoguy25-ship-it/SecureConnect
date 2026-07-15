// Fixes two real, related Xcode build issues that both stem from the same root cause:
// GoogleMaps3D is pulled in via Swift Package Manager (spm_dependency, see
// ../ios/Map3D.podspec) *inside* a CocoaPods pod, not as a direct dependency of the app's own
// Xcode target -- documented as a known caveat right in that podspec.
//
// 1. Archive-time signature collision: "GoogleMaps3D.xcframework-ios.signature couldn't be
//    copied to 'Signatures' because an item with the same name already exists." Xcode tries
//    to embed/sign that xcframework's signature file from two places (nested under the Map3D
//    pod's own product, and again at the top level), and the second copy collides with the
//    first. Confirmed via a merged fix in maplibre-react-native for the identical error with
//    a different xcframework (https://github.com/maplibre/maplibre-react-native/pull/1490).
//
// 2. Real-device launch crash (confirmed via an actual TestFlight crash log): "Library not
//    loaded: @rpath/GoogleMaps3D.framework/GoogleMaps3D ... no such file". The app compiles
//    and links against it fine (which is why the archive succeeds), but because the
//    dependency lives on the *pod's* target rather than the app's own target, Xcode never
//    copies the actual framework binary into the app bundle's Frameworks folder -- it works
//    when running from Xcode/simulator (where the framework is still on disk from the build),
//    but the shipped .ipa is missing it entirely.
//
// Both fixed the same way: Run Script build phases added directly to the *app's own* Xcode
// target (not the pod's), since that's the one whose final output actually needs the fix.
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const POST_INSTALL_MARKER = "post_install do |installer|";

const SIGNATURE_FIX_SNIPPET = `
    # [map3d] Real Xcode build fixes for known GoogleMaps3D (Swift Package Manager, pulled in
    # via spm_dependency in modules/map3d/ios/Map3D.podspec) issues -- an archive-time
    # signature-file collision, and a real-device launch crash from the framework never being
    # embedded in the app bundle. See modules/map3d/plugin/withGoogleMaps3DSignatureFix.js.
    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_targets.each do |user_target|
        signature_phase_name = "[Map3D] Remove GoogleMaps3D.xcframework-ios.signature"
        unless user_target.shell_script_build_phases.any? { |p| p.name == signature_phase_name }
          phase = user_target.new_shell_script_build_phase(signature_phase_name)
          phase.shell_script = 'rm -rf "$CONFIGURATION_BUILD_DIR/GoogleMaps3D.xcframework-ios.signature"'
          phase.always_out_of_date = "1"
        end

        embed_phase_name = "[Map3D] Embed GoogleMaps3D.framework"
        unless user_target.shell_script_build_phases.any? { |p| p.name == embed_phase_name }
          phase = user_target.new_shell_script_build_phase(embed_phase_name)
          phase.shell_script = <<-'SCRIPT'
    SRC="$CONFIGURATION_BUILD_DIR/GoogleMaps3D.framework"
    DEST_DIR="$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH"
    DEST="$DEST_DIR/GoogleMaps3D.framework"
    if [ ! -d "$SRC" ]; then
      echo "warning: [Map3D] $SRC not found -- GoogleMaps3D.framework will not be embedded, real-device builds will crash on launch"
      exit 0
    fi
    mkdir -p "$DEST_DIR"
    rm -rf "$DEST"
    cp -R "$SRC" "$DEST"
    if [ -n "$EXPANDED_CODE_SIGN_IDENTITY" ]; then
      /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" --preserve-metadata=identifier,entitlements,flags "$DEST"
    fi
    SCRIPT
          phase.always_out_of_date = "1"
        end
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
