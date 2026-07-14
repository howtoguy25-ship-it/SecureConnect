import GoogleMaps3D
import SwiftUI

// The actual SwiftUI content hosted inside ExpoMap3DView's UIHostingController. Kept tiny on
// purpose -- all the "translate JS props into SDK calls" logic lives in ExpoMap3DView.swift,
// this just renders whatever Map3DState currently holds.
//
// Camera-only for now -- an earlier version tried adding Marker3D/Polyline as children
// inside Map's trailing closure (mirroring the isolated doc snippets for each), but that
// produced a real Xcode build error ("no exact matches in call to static method
// 'buildExpression'"), meaning Google's Map doesn't accept generic SwiftUI content there the
// way this assumed -- the two isolated snippets were never actually confirmed to compose
// together this way. Pulled back out to get a confirmed-working camera view first rather
// than keep guessing at this SDK's result-builder internals through more failed builds.
// markerPosition/routeCoordinates props are still accepted from JS (see
// ExpoMap3DView.swift/Map3DModule.swift) but don't render anything on iOS yet.
struct Map3DContentView: View {
  @ObservedObject var state: Map3DState

  var body: some View {
    Map(camera: $state.camera, mode: state.mapMode)
  }
}
