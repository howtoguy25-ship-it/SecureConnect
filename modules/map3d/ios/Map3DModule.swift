import ExpoModulesCore

public class Map3DModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Map3D")

    View(ExpoMap3DView.self) {
      Events("onStatusChange")

      Prop("center") { (view: ExpoMap3DView, center: [String: Double]) in
        guard let lat = center["latitude"], let lng = center["longitude"] else { return }
        view.setCenter(latitude: lat, longitude: lng)
      }

      Prop("mapMode") { (view: ExpoMap3DView, mode: String?) in
        view.setMapMode(mode ?? "HYBRID")
      }

      Prop("markerPosition") { (view: ExpoMap3DView, position: [String: Double]?) in
        guard let lat = position?["latitude"], let lng = position?["longitude"] else { return }
        view.setMarkerPosition(latitude: lat, longitude: lng)
      }

      Prop("routeCoordinates") { (view: ExpoMap3DView, points: [[String: Double]]?) in
        view.setRouteCoordinates(points ?? [])
      }

      // AsyncFunction, not Function -- real Xcode error: "no exact matches in call to static
      // method 'buildExpression'" at this exact line. Checked expo-camera's own iOS module
      // (node_modules/expo-camera/ios/CameraViewModule.swift): every single Function call
      // inside its View { } block is AsyncFunction, never plain Function -- this SDK's
      // View-scoped result builder apparently doesn't have a buildExpression overload for
      // plain Function at all, only for AsyncFunction. (Android's Kotlin View{} block does
      // support plain Function -- this is an iOS-only fix.)
      AsyncFunction("rotateCamera") { (view: ExpoMap3DView, deltaDeg: Double) in
        view.rotateCamera(deltaDeg: deltaDeg)
      }

      AsyncFunction("tiltCamera") { (view: ExpoMap3DView, deltaDeg: Double) in
        view.tiltCamera(deltaDeg: deltaDeg)
      }
    }
  }
}
