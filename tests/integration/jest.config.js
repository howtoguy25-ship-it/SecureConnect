/**
 * Jest config for the build-63 sealed-sender HTTP test harness.
 *
 * Distinct from `jest.config.js` at the repo root (which is the pure-crypto
 * fast path that intentionally excludes `server/`). This config DOES pull
 * in `server/` because it boots the real express app under supertest.
 *
 * Run:  npx jest --config tests/integration/jest.config.js --forceExit
 *
 * --forceExit because socket.io + pg pool keep handles open after the
 * tests complete; both background sweep intervals in registerRoutes are
 * already `.unref()`ed but socket.io's internal timers are not.
 */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "../..",
  roots: ["<rootDir>/tests/integration"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }],
  },
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/shared/$1",
  },
  testTimeout: 30000,
  setupFilesAfterEnv: ["<rootDir>/tests/integration/jest.setup.ts"],
};
