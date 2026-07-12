import * as tf from "@tensorflow/tfjs";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";

// Replaces @tensorflow/tfjs-react-native's bundleResourceIO (that package is unmaintained,
// see legacy/ai-vehicle-detection-tfjs/README.md) with a plain tf.io.IOHandler built on
// expo-asset + expo-file-system, both actively maintained and version-locked to the rest of
// the app. Loads a Keras-style tfjs LayersModel (model.json + one or more weight shard .bin
// files, all require()'d as Metro assets) entirely from local bundled files -- no network.
export function bundledModelIO(
  modelJsonModule: number,
  weightModules: number[]
): tf.io.IOHandler {
  return {
    load: async (): Promise<tf.io.ModelArtifacts> => {
      const modelJsonAsset = await Asset.fromModule(modelJsonModule).downloadAsync();
      const modelJson = (await new File(
        modelJsonAsset.localUri ?? modelJsonAsset.uri
      ).json()) as {
        modelTopology: {};
        weightsManifest: tf.io.WeightsManifestConfig;
      };

      const weightSpecs = modelJson.weightsManifest.flatMap((group) => group.weights);

      const weightData = await Promise.all(
        weightModules.map(async (mod) => {
          const asset = await Asset.fromModule(mod).downloadAsync();
          return new File(asset.localUri ?? asset.uri).arrayBuffer();
        })
      );

      return {
        modelTopology: modelJson.modelTopology,
        weightSpecs,
        weightData,
        format: "layers-model",
        generatedBy: "TensorFlow.js tfjs-layers Converter",
        convertedBy: null,
      };
    },
  };
}
