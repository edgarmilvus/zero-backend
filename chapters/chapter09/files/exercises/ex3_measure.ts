/**
 * Exercise 3 - the cold start nobody budgeted.
 *
 * The first query takes 1.7 seconds because it instantiates 26 MB of WebAssembly. A spinner with no
 * number looks broken; a page that says "starting the database, about two seconds" looks like a page
 * starting a database — and can be measured.
 */

import { eq, expect, near, type Check } from "./selfcheck.ts";

export type Startup = {
  /** Milliseconds before the first query answers. */
  readonly coldMs: number;
  /** Milliseconds for a query once the engine is up. */
  readonly warmMs: number;
  /** How many queries the page will run in this session. */
  readonly queries: number;
};

/** The total a page waits, for a session of `queries`. */
export function sessionMs(startup: Startup): number {
  return startup.coldMs + startup.queries * startup.warmMs;
}

/** What the user sees at second `at`, as a fraction complete. */
export function progress(startup: Startup, at: number): number {
  if (startup.coldMs <= 0) return 1;
  return Math.min(1, at / startup.coldMs);
}

/** The break-even: how many queries make a warm start worth caching. */
export function queriesToJustify(coldMs: number, warmMs: number, reopenMs: number): number {
  const saved = coldMs - reopenMs;
  if (saved <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(saved / warmMs);
}

const PGLITE: Startup = { coldMs: 1700, warmMs: 7, queries: 10 };
const MEMORY: Startup = { coldMs: 2, warmMs: 7, queries: 10 };

export const checks: readonly Check[] = [
  {
    name: "the cold start is most of a ten-query session",
    run: () => expect(PGLITE.coldMs / sessionMs(PGLITE) > 0.9, "cold share"),
  },
  {
    name: "and the queries are the rest",
    run: () => near(sessionMs(PGLITE) - PGLITE.coldMs, 70, 1e-9, "queries"),
  },
  {
    name: "an in-memory database with no wasm has no cold start",
    run: () => expect(sessionMs(MEMORY) < 100, `${sessionMs(MEMORY)}`),
  },
  {
    name: "progress at half the cold start is half",
    run: () => near(progress(PGLITE, 850), 0.5, 1e-9, "progress"),
  },
  {
    name: "progress never exceeds one",
    run: () => eq(progress(PGLITE, 5000), 1, "progress"),
  },
  {
    name: "a zero cold start is immediately complete",
    run: () => eq(progress({ ...PGLITE, coldMs: 0 }, 0), 1, "progress"),
  },
  {
    name: "reopening in the same session is cheaper than the first start",
    run: () => expect(PGLITE.coldMs > 200, "cold"),
  },
  {
    name: "caching a warm engine pays for itself after one query",
    run: () => expect(queriesToJustify(1700, 7, 200) <= 250, "queries"),
  },
  {
    name: "a reopen as expensive as a cold start never pays",
    run: () => eq(queriesToJustify(1700, 7, 1700), Number.POSITIVE_INFINITY, "infinity"),
  },
  {
    name: "the session total is linear in the query count",
    run: () => {
      const one = sessionMs({ ...PGLITE, queries: 1 });
      const two = sessionMs({ ...PGLITE, queries: 2 });
      return near(two - one, PGLITE.warmMs, 1e-9, "delta");
    },
  },
];

export function main(): number {
  console.log(`pglite     cold ${PGLITE.coldMs} ms, ${PGLITE.queries} queries = ${sessionMs(PGLITE)} ms`);
  console.log(`memory     cold ${MEMORY.coldMs} ms, ${MEMORY.queries} queries = ${sessionMs(MEMORY)} ms`);
  console.log("");
  console.log(`the first query is ${(PGLITE.coldMs / PGLITE.warmMs).toFixed(0)}x the cost of the next two hundred`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
