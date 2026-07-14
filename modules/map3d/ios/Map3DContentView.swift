import GoogleMaps3D
import SwiftUI

// The actual SwiftUI content hosted inside ExpoMap3DView's UIHostingController. Kept tiny on
// purpose -- all the "translate JS props into SDK calls" logic lives in ExpoMap3DView.swift,
// this just renders whatever Map3DState currently holds.
struct Map3DContentView: View {
  @ObservedObject var state: Map3DState

  var body: some View {
    Map(camera: $state.camera, mode: state.mapMode) {
      if let position = state.markerPosition {
        Marker3D(position: position)
      }
      if !state.routeCoordinates.isEmpty {
        Polyline(path: state.routeCoordinates)
          .stroke(.init(strokeColor: .init(red: 0.145, green: 0.388, blue: 0.922, alpha: 1), strokeWidth: 8))
      }
    }
  }
}
