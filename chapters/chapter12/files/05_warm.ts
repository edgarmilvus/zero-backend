/**
 * Example 5 - when to warm the model.
 *
 *   node chapters/chapter12/files/05_warm.ts
 *
 * A warm-up that runs at idle costs the load and saves the first query; a warm-up that runs on every
 * load costs the load every visit and saves a query that may never come. The decision is arithmetic,
 * and it depends on how many searches a session actually makes.
 */

export type Policy = {
  readonly loadMs: number;
  readonly firstQueryWithoutWarmMs: number;
  readonly queriesPerSession: number;
};

/** The time a session spends before its first answer, with and without an idle warm-up. */
export function sessionCost(policy: Policy, warmAtIdle: boolean): number {
  const { loadMs, firstQueryWithoutWarmMs, queriesPerSession } = policy;
  if (queriesPerSession <= 0) return 0;
  return warmAtIdle ? loadMs : loadMs + firstQueryWithoutWarmMs;
}

export function shouldWarm(policy: Policy): boolean {
  if (policy.queriesPerSession === 0) return false;
  const cold = sessionCost(policy, false);
  const warm = sessionCost(policy, true);
  return warm <= cold;
}

export function main(): number {
  const record = { loadMs: 1_009, firstQueryWithoutWarmMs: 1_009, queriesPerSession: 3 };
  const idle = { loadMs: 1_009, firstQueryWithoutWarmMs: 98, queriesPerSession: 3 };

  console.log(`first visit       ${sessionCost(record, false).toFixed(0)} ms to the first answer`);
  console.log(`worker warmed     ${sessionCost(idle, true).toFixed(0)} ms at idle, then ${idle.firstQueryWithoutWarmMs} ms a query`);
  console.log(`a visit with none ${sessionCost({ ...idle, queriesPerSession: 0 }, true).toFixed(0)} ms, and the model is never touched`);
  console.log("");
  console.log(`warm on a search page: ${shouldWarm(idle)}; warm on a page that never searches: ${shouldWarm({
    ...idle,
    queriesPerSession: 0,
  })}`);

  return shouldWarm(idle) && !shouldWarm({ ...idle, queriesPerSession: 0 }) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
