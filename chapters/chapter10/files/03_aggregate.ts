/**
 * Example 3 - the question the chapter is about: seven groups over a million rows.
 *
 *   node chapters/chapter10/files/03_aggregate.ts
 *
 * The aggregate is checked against arithmetic, not against a stored answer: `queries.ts` computes
 * the same sum in a loop, and the program fails if the engine disagrees by more than a cent.
 */

import { AGGREGATE_BY_KIND, CREATE_EVENTS, TOP_USERS, expectedSums } from "./queries.ts";
import { openDuck } from "./duck.ts";
import { assertSum, renderAggregate, type KindRow, type UserRow } from "./report.ts";

export async function main(): Promise<number> {
  const { duck } = await openDuck();
  await duck.query(CREATE_EVENTS);

  const started = performance.now();
  const rows = await duck.query<KindRow>(AGGREGATE_BY_KIND);
  const aggregateMs = performance.now() - started;

  console.log(renderAggregate(rows, aggregateMs));
  assertSum(rows, expectedSums());

  const topStarted = performance.now();
  const top = await duck.query<UserRow>(TOP_USERS);
  const topMs = performance.now() - topStarted;

  console.log("");
  console.log(`top users         ten of a thousand in ${topMs.toFixed(0)} ms`);
  for (const row of top.slice(0, 3)) {
    console.log(`  user ${String(row.user_id).padStart(4)}  ${row.n} events`);
  }
  console.log("");
  console.log("the sums match the arithmetic, and nothing was read from a disk");

  await duck.close();
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}
