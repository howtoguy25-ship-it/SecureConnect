/**
 * @deprecated As of Phase 2 build 62 the project uses real jest (see
 * `jest.config.js` + `npx jest`). This harness is kept ONLY as an offline
 * fallback for environments that can't run jest (e.g., a CI box without the
 * dev-deps installed). New tests should use jest's `describe / test / expect`
 * directly. Do not add new callers of this module.
 */

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

const REGISTRY: TestCase[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  REGISTRY.push({ name, fn });
}

export function assert(cond: unknown, msg = "assertion failed"): void {
  if (!cond) {
    throw new Error(msg);
  }
}

export function assertThrows(fn: () => void, pattern?: RegExp): void {
  let threw = false;
  let captured: unknown;
  try {
    fn();
  } catch (e) {
    threw = true;
    captured = e;
  }
  if (!threw) throw new Error("expected function to throw");
  if (pattern) {
    const msg = (captured as Error)?.message ?? String(captured);
    if (!pattern.test(msg)) {
      throw new Error(`expected error matching ${pattern} but got: ${msg}`);
    }
  }
}

/** Called by the runner to drain the registry. */
export async function runRegistered(file: string): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  const cases = REGISTRY.splice(0, REGISTRY.length);
  for (const tc of cases) {
    try {
      await tc.fn();
      passed++;
      console.log(`  ok   ${tc.name}`);
    } catch (e) {
      failed++;
      const msg = (e as Error)?.message ?? String(e);
      console.error(`  FAIL ${tc.name}\n       ${msg}`);
    }
  }
  console.log(`  ${passed}/${passed + failed} passed in ${file}`);
  return { passed, failed };
}
