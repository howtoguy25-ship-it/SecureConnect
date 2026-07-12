import ExpoModulesCore

// TODO: `import TensorFlowLiteSwift` once the Pod is added (see ../README.md step 4).

public class YamnetSirenModule: Module {
  // TODO: hold a loaded `Interpreter` instance here once TFLite is wired up.

  public func definition() -> ModuleDefinition {
    Name("YamnetSiren")

    AsyncFunction("loadModel") { () -> Bool in
      // TODO: locate yamnet.tflite in the bundle and initialize a TFLite Interpreter.
      // Return true once the interpreter is ready for classify() calls.
      return false
    }

    AsyncFunction("classify") { (pcmSamples: [Float]) -> [[String: Any]] in
      // TODO: run pcmSamples (mono 16kHz, ~15,600 samples per YAMNet window) through the
      // interpreter, map output scores to yamnet_class_map.csv labels, and return the
      // top results, e.g. [["label": "Siren", "confidence": 0.83], ...].
      return []
    }
  }
}
