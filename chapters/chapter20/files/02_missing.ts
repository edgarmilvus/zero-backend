/**
 * Example 2 - a claim whose file moved, and one whose number is under its floor.
 *
 *   node chapters/chapter20/files/02_missing.ts
 */

import { assertVerdict } from "./report.ts";
import { verify } from "./ledger.ts";
import type { Claim } from "./claims.ts";

const MOVED: Claim = {
  id: "x1",
  chapter: 8,
  statement: "a file that is not there",
  evidence: "runs/chapter08/does-not-exist/record.json",
};

const UNDER: Claim = {
  id: "x2",
  chapter: 14,
  statement: "a number under its floor",
  evidence: "runs/chapter14/share-link/record.json",
  field: "tokenLength",
  min: 100_000,
};

export function main(): number {
  const moved = verify(MOVED);
  assertVerdict(moved, false);
  console.log(`moved             ${moved.ok ? "ok" : moved.reason}`);

  const under = verify(UNDER);
  assertVerdict(under, false);
  console.log(`under             ${under.ok ? "ok" : under.reason}`);

  const good = verify({ ...UNDER, id: "x3", min: 1 });
  assertVerdict(good, true);
  console.log(`good              ${good.ok ? `ok (${good.value})` : good.reason}`);

  console.log("");
  console.log("a claim is a test: the file has to exist and the number has to reach");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
