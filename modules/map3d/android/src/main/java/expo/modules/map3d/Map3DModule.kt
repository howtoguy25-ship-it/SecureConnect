package expo.modules.map3d

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class Map3DModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Map3D")

    View(ExpoMap3DView::class) {
      Events("onStatusChange")

      Prop("center") { view, center: Map<String, Double> ->
        val lat = center["latitude"] ?: return@Prop
        val lng = center["longitude"] ?: return@Prop
        view.setCenter(lat, lng)
      }

      Prop("mapMode") { view, mode: String? ->
        view.setMapMode(mode ?: "HYBRID")
      }

      Prop("markerPosition") { view, position: Map<String, Double>? ->
        val lat = position?.get("latitude") ?: return@Prop
        val lng = position["longitude"] ?: return@Prop
        view.setMarkerPosition(lat, lng)
      }

      Prop("routeCoordinates") { view, points: List<Map<String, Double>>? ->
        view.setRouteCoordinates(points ?: emptyList())
      }

      Function("rotateCamera") { view: ExpoMap3DView, deltaDeg: Double ->
        view.rotateCamera(deltaDeg)
      }

      Function("tiltCamera") { view: ExpoMap3DView, deltaDeg: Double ->
        view.tiltCamera(deltaDeg)
      }
    }
  }
}
