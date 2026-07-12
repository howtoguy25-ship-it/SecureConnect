package expo.modules.yamnetsiren

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// TODO: add `implementation("org.tensorflow:tensorflow-lite:2.14.0")` in
// android/build.gradle, then `import org.tensorflow.lite.Interpreter` here.

class YamnetSirenModule : Module() {
  // TODO: hold a loaded Interpreter instance here once TFLite is wired up.

  override fun definition() = ModuleDefinition {
    Name("YamnetSiren")

    AsyncFunction("loadModel") {
      // TODO: load yamnet.tflite from android/app/src/main/assets and initialize an
      // Interpreter. Return true once ready for classify() calls.
      false
    }

    AsyncFunction("classify") { pcmSamples: List<Double> ->
      // TODO: run pcmSamples (mono 16kHz, ~15,600 samples per YAMNet window) through the
      // interpreter, map output scores to yamnet_class_map.csv labels, and return the
      // top results as a list of maps: [{"label": "Siren", "confidence": 0.83}, ...].
      emptyList<Map<String, Any>>()
    }
  }
}
