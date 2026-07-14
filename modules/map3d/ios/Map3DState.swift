import GoogleMaps3D
import SwiftUI

// Shared, observable state driving the SwiftUI Map content -- ExpoMap3DView (the UIKit host)
// writes into this from React prop updates, and Map3DContentView's `Map(camera: $camera, ...)`
// binding reacts to it. This is the SwiftUI counterpart of Android's ExpoMap3DView, which
// holds the same kind of "latest desired state from JS" fields directly as var properties
// (SwiftUI just needs them to be @Published on an ObservableObject instead).
final class Map3DState: ObservableObject {
  @Published var camera: Camera
  @Published var mapMode: MapMode = .hybrid
  @Published var markerPosition: LatLngAltitude?
  @Published var routeCoordinates: [LatLngAltitude] = []

  init() {
    // Every field explicit here (matching Google's documented sample) rather than relying on
    // unconfirmed default values for fieldOfView/altitudeMode -- this is a pre-GA SDK shipped
    // as a precompiled binary (no public Swift source to check), so this order is inferred
    // from two real Xcode compile errors so far: "argument 'heading' must precede argument
    // 'fieldOfView'" and "argument 'tilt' must precede argument 'fieldOfView'". Both center,
    // heading, tilt, roll, range before fieldOfView/altitudeMode.
    camera = Camera(
      center: LatLngAltitude(latitude: 0, longitude: 0, altitude: 0),
      heading: 0,
      tilt: 0,
      roll: 0,
      range: 1500,
      fieldOfView: .degrees(50),
      altitudeMode: .relativeToGround
    )
  }
}
