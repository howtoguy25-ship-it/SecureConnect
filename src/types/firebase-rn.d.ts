// @firebase/auth's package.json lists "types" before "react-native" in its exports
// conditions, so under Node/TS exports-condition matching "types" always wins and the
// TypeScript checker only ever sees dist/auth-public.d.ts — which omits
// getReactNativePersistence even though it's genuinely exported at runtime (Metro
// resolves the React Native build via the legacy top-level "react-native" package.json
// field, unaffected by this). This augmentation restores the missing declaration so
// src/services/firebase.ts type-checks; it has no effect on what code actually runs.
export {};

declare module "@firebase/auth" {
  import type { Persistence } from "@firebase/auth";

  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
