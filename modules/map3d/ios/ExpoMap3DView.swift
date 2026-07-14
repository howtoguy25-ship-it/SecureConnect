import ExpoModulesCore
import GoogleMaps3D
import SwiftUI

// iOS side of the same "real photorealistic 3D satellite" feature already shipped on web
// (web/src/components/Map3DView.tsx) and Android (../android/.../ExpoMap3DView.kt) -- wraps
// Google's Maps 3D SDK for iOS, which (unlike Android's classic View-based SDK) is
// SwiftUI-native. This class is the UIKit bridge: a plain ExpoView hosting a
// UIHostingController<Map3DContentView>, mirroring the same hosting pattern
// ExpoModulesCore's own SwiftUIHostingView uses internally (see node_modules/
// expo-modules-core/ios/Core/Views/SwiftUI/SwiftUIHostingView.swift) rather than inventing a
// new one, since that's real, working, first-party code to mirror.
//
// Google's iOS SDK is Experimental/pre-GA -- this was written from Google's documented
// samples, but without any way to compile or run Swift in this environment. Expect the first
// real signal on correctness to come from an actual Xcode/EAS build, not this review.
private var hasSetApiKey = false

public class ExpoMap3DView: ExpoView {
  private let state = Map3DState()
  private let hostingController: UIHostingController<Map3DContentView>

  // Declared for JS-side prop-contract parity with Android (see Map3DView's onSteadyChange
  // prop in ../index.tsx), but not actually dispatched yet -- Android exposes a confirmed
  // setOnMapSteadyListener; no equivalent steady/error signal was confirmed in Google's iOS
  // SDK docs (Experimental/sparse) while writing this. JS callers on iOS just won't receive
  // onSteadyChange calls for now.
  let onStatusChange = EventDispatcher()

  public required init(appContext: AppContext? = nil) {
    if !hasSetApiKey {
      hasSetApiKey = true
      if let apiKey = Bundle.main.object(forInfoDictionaryKey: "GMSApiKey3D") as? String, !apiKey.isEmpty {
        Map.apiKey = apiKey
      }
    }

    hostingController = UIHostingController(rootView: Map3DContentView(state: state))
    super.init(appContext: appContext)
    hostingController.view.backgroundColor = .clear
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, let parentController = reactViewController() {
      parentController.addChild(hostingController)
      addSubview(hostingController.view)
      hostingController.didMove(toParent: parentController)
      hostingController.view.frame = bounds
      hostingController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    } else {
      hostingController.view.removeFromSuperview()
      hostingController.removeFromParent()
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hostingController.view.frame = bounds
  }

  // --- Prop setters, called from Map3DModule's View{} Prop blocks ---

  // Mutates the existing Camera value's properties in place (rather than reconstructing a
  // whole new Camera(...) with every field spelled out) specifically to avoid repeating the
  // same "guess the declared parameter order" risk that broke the one real construction call
  // in Map3DState.swift -- Swift enforces call-site argument order against the actual
  // declared initializer, and this SDK's real order isn't fully confirmed from docs alone.
  func setCenter(latitude: Double, longitude: Double) {
    state.camera.center = LatLngAltitude(latitude: latitude, longitude: longitude, altitude: 0)
  }

  func setMapMode(_ mode: String) {
    state.mapMode = mode == "SATELLITE" ? .satellite : .hybrid
  }

  func setMarkerPosition(latitude: Double, longitude: Double) {
    state.markerPosition = LatLngAltitude(latitude: latitude, longitude: longitude, altitude: 0)
  }

  func setRouteCoordinates(_ points: [[String: Double]]) {
    state.routeCoordinates = points.compactMap { point in
      guard let lat = point["latitude"], let lng = point["longitude"] else { return nil }
      return LatLngAltitude(latitude: lat, longitude: lng, altitude: 0)
    }
  }

  // --- Imperative joystick functions, called from Map3DModule's Function blocks ---

  func rotateCamera(deltaDeg: Double) {
    let rawHeading = (state.camera.heading + deltaDeg).truncatingRemainder(dividingBy: 360)
    state.camera.heading = (rawHeading + 360).truncatingRemainder(dividingBy: 360)
  }

  func tiltCamera(deltaDeg: Double) {
    state.camera.tilt = min(max(state.camera.tilt + deltaDeg, 0), 67.5)
  }
}
