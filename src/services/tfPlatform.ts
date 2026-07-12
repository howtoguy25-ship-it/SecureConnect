import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-cpu";

// @tensorflow/tfjs-react-native used to double as tfjs-core's *required* platform
// registration for React Native (fetch/now/encode/decode/isTypedArray) -- without it,
// tfjs-core detects neither "browser" (no window.document in RN) nor "node" and never
// registers any platform at all, so it needs a real replacement, not just a workaround.
// This is the same handful of methods tfjs-react-native's own platform shim implemented,
// backed directly by React Native/Hermes's built-in fetch/TextEncoder/TextDecoder instead
// of anything React-Native-specific from that now-unmaintained package.
class PlatformReactNative implements tf.Platform {
  private textEncoder = new TextEncoder();

  fetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(path, init);
  }

  now(): number {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  encode(text: string, encoding: string): Uint8Array {
    if (encoding !== "utf-8" && encoding !== "utf8") {
      throw new Error(`Only utf-8 encoding is supported, got ${encoding}`);
    }
    return this.textEncoder.encode(text);
  }

  decode(bytes: Uint8Array, encoding: string): string {
    return new TextDecoder(encoding).decode(bytes);
  }

  isTypedArray(
    value: unknown
  ): value is Float32Array | Int32Array | Uint8Array | Uint8ClampedArray {
    return (
      value instanceof Float32Array ||
      value instanceof Int32Array ||
      value instanceof Uint8Array ||
      value instanceof Uint8ClampedArray
    );
  }
}

let readyPromise: Promise<void> | null = null;

/** Registers the React Native platform shim and the CPU backend exactly once. */
export function ensureTfReady(): Promise<void> {
  if (!readyPromise) {
    tf.env().setPlatform("react-native", new PlatformReactNative());
    readyPromise = tf.setBackend("cpu").then(() => tf.ready());
  }
  return readyPromise;
}
