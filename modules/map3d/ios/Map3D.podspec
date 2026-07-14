require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'Map3D'
  s.version        = package['version']
  s.summary        = 'Real photorealistic 3D satellite view for TrackLine, via Google Maps 3D SDK for iOS.'
  s.author         = 'TrackLine'
  s.homepage       = 'https://github.com/howtoguy25-ship-it/secureconnect'
  s.platform       = :ios, '16.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Google's Maps 3D SDK for iOS ships via Swift Package Manager only (no CocoaPods spec of
  # its own) -- this is React Native's own >=0.75 bridge for pulling an SPM-only dependency
  # into an otherwise CocoaPods-based build, not a hand-rolled workaround. Pinned loosely
  # (upToNextMajorVersion from 0.1.0) since the SDK is still pre-1.0/Experimental and versions
  # accordingly -- if this exact constraint doesn't resolve, check
  # https://github.com/googlemaps/ios-maps-3d-sdk/releases or/tags for the real current tag
  # and adjust minimumVersion here.
  #
  # KNOWN CAVEAT (see modules/map3d/README.md): spm_dependency alone can leave a *dynamic*
  # framework unlinked from the main app target, working in the simulator but crashing on a
  # real device. If that happens, the fix is adding the package to the main target directly
  # (a config-plugin change patching the Xcode project), not a podspec change -- test on a
  # real physical device via a development build, not just the simulator.
  spm_dependency(
    s,
    url: 'https://github.com/googlemaps/ios-maps-3d-sdk',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '0.1.0' },
    products: ['GoogleMaps3D']
  )

  s.source_files = '**/*.{h,m,mm,swift}'
end
