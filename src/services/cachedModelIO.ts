import * as tf from "@tensorflow/tfjs";
import { Directory, File, Paths } from "expo-file-system";

// COCO-SSD's default load() fetches its graph model (several MB across model.json + weight
// shards) from Google's CDN over the network EVERY time the vehicle detection screen opens --
// tfPlatform.ts's minimal platform shim registers no persistent cache the way a browser's
// IndexedDB-backed tf.io handler normally would. On a slow/flaky connection that's exactly
// "takes long to load and doesn't load." This wraps any tf.io network URL with a one-time
// on-device disk cache: the first load fetches and persists the parsed artifacts, every load
// after that reads straight off disk, no network involved.
//
// Deliberately defensive throughout -- any read/write/parse failure on the cache falls back
// to a plain network fetch rather than ever surfacing a cache bug as a broken model load.
const CACHE_DIR_NAME = "tfjs-model-cache";

export function cachedModelIO(networkUrl: string, cacheKey: string): tf.io.IOHandler {
  const dir = new Directory(Paths.document, CACHE_DIR_NAME, cacheKey);
  const topologyFile = new File(dir, "topology.json");
  const weightSpecsFile = new File(dir, "weight-specs.json");
  const weightDataFile = new File(dir, "weights.bin");

  return {
    load: async (): Promise<tf.io.ModelArtifacts> => {
      try {
        if (topologyFile.exists && weightSpecsFile.exists && weightDataFile.exists) {
          const modelTopology = JSON.parse(await topologyFile.text());
          const weightSpecs = JSON.parse(await weightSpecsFile.text());
          const weightBytes = await weightDataFile.bytes();
          return {
            modelTopology,
            weightSpecs,
            weightData: weightBytes.buffer as ArrayBuffer,
            format: "graph-model",
            generatedBy: "TrackLine-cache",
            convertedBy: null,
          };
        }
      } catch (err) {
        console.warn("[cachedModelIO] cached model unreadable, refetching from network", err);
      }

      const httpHandler = tf.io.browserHTTPRequest(networkUrl);
      if (!httpHandler.load) throw new Error("browserHTTPRequest handler has no load()");
      const artifacts = await httpHandler.load();

      try {
        if (!dir.exists) dir.create({ intermediates: true });
        if (!topologyFile.exists) topologyFile.create({ intermediates: true });
        if (!weightSpecsFile.exists) weightSpecsFile.create({ intermediates: true });
        if (!weightDataFile.exists) weightDataFile.create({ intermediates: true });

        topologyFile.write(JSON.stringify(artifacts.modelTopology ?? null));
        weightSpecsFile.write(JSON.stringify(artifacts.weightSpecs ?? []));

        const weightData = artifacts.weightData;
        const buffers = Array.isArray(weightData) ? weightData : weightData ? [weightData] : [];
        const totalBytes = buffers.reduce((sum, b) => sum + b.byteLength, 0);
        const combined = new Uint8Array(totalBytes);
        let offset = 0;
        for (const buf of buffers) {
          combined.set(new Uint8Array(buf), offset);
          offset += buf.byteLength;
        }
        weightDataFile.write(combined);
      } catch (err) {
        // Cache write failed (disk full, permissions, etc) -- harmless, just means next
        // launch fetches over the network again instead of from disk.
        console.warn("[cachedModelIO] failed to write model cache", err);
      }

      return artifacts;
    },
  };
}
