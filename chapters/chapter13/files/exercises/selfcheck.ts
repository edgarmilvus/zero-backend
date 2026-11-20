/**
 * The smallest harness that can fail.
 *
 * Five exercises, five files of assertions, one reporter. Nothing here knows anything about
 * ledgers, probes or stores: that is the point, and it is why an exercise can be tested without
 * the chapter it belongs to.
 */

export type Check = {
  readonly name: string;
  readonly run: () => void | boolean | Promise<void | boolean>;
};

export function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}

export function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) {
    throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  }
  return true;
}

export function near(actual: number, expected: number, tolerance: number, what: string): true {
  if (!(Math.abs(actual - expected) <= tolerance)) {
    throw new Error(`${what}: got ${actual}, expected ${expected} +/- ${tolerance}`);
  }
  return true;
}

export function throws(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

/**
 * Runs a list of checks and returns how many passed.
 *
 * Awaited, because a check may be asynchronous and a reporter that does not await would pass
 * every async check it was given. Chapter 3's first exercise is the reason this signature is
 * `Promise<number>`.
 */
export async function runChecks(label: string, checks: readonly Check[]): Promise<number> {
  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`  ok   ${label}.${index + 1}  ${entry.name}`);
    } catch (error) {
      console.log(`  FAIL ${label}.${index + 1}  ${entry.name}`);
      console.log(`              ${(error as Error).message}`);
    }
  }
  return passed;
}
