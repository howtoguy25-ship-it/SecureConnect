/**
 * Jest config for the E2EE crypto unit tests.
 *
 * Phase 2 build 62 introduced this in place of the hand-rolled harness in
 * `tests/harness.ts` (now deprecated, kept as a fallback runner). These
 * tests are pure-crypto — no React Native, no SecureStore, no fetch — so
 * they run under plain `node` via ts-jest without needing `jest-expo` or
 * the React Native preset. Keep it that way; if you ever need RN-specific
 * tests, add a second project block (jest "projects" config) rather than
 * dragging RN into this fast path.
 *
 * Run: npx jest
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests/e2ee"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }],
  },
  // Don't sweep up the rest of the repo's TS — these tests intentionally
  // import only pure crypto modules. Adding more here = slower + more
  // surface for React-Native-only imports to break the runner.
  modulePathIgnorePatterns: ["<rootDir>/node_modules", "<rootDir>/server", "<rootDir>/client/screens"],
};
