/**
 * E2EE test runner.
 *
 * Hand-rolled because the Expo guidelines forbid editing package.json, so we
 * can't drop in jest-expo + a "test" script. This runner imports each test
 * file in `tests/e2ee/` (which registers cases with the harness) and drains
 * the registry.
 *
 * Usage:
 *   npx tsx scripts/run-e2ee-tests.ts
 *
 * Exit code is the number of failed tests (0 = all green).
 */

import { runRegistered } from "../tests/harness";
import { readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const TESTS_DIR = resolve(__dirname, "..", "tests", "e2ee");

async function main(): Promise<void> {
  let totalPassed = 0;
  let totalFailed = 0;

  const files = readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();

  if (files.length === 0) {
    console.error("No test files found in", TESTS_DIR);
    process.exit(2);
  }

  for (const file of files) {
    const full = join(TESTS_DIR, file);
    console.log(`\n# ${file}`);
    // Import side-effect registers the cases.
    await import(full);
    const { passed, failed } = await runRegistered(file);
    totalPassed += passed;
    totalFailed += failed;
  }

  console.log(`\nTOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Runner crashed:", e);
  process.exit(3);
});
