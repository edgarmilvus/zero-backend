/**
 * Example 1 - two devices and one merge, in both directions.
 *
 *   node chapters/chapter13/files/01_merge.ts
 *
 * Each device edits a different note, then they exchange everything. The order of the exchange must not
 * matter: `merge(a, b)` and `merge(b, a)` are the same document, and the program refuses to continue if
 * they are not.
 */

import { assertCommutative, renderMerge, renderReplica } from "./report.ts";
import { createReplica, localWrite, merge } from "./sync.ts";

export function main(): number {
  let laptop = createReplica("laptop");
  let phone = createReplica("phone");

  laptop = localWrite(laptop, "a1", { title: "Merging notes", body: "one device at a time" });
  phone = localWrite(phone, "b1", { title: "Offline first", body: "the network is optional" });

  const forward = merge(laptop, phone);
  const backward = merge(phone, laptop);

  console.log(renderReplica(laptop));
  console.log("");
  console.log(renderReplica(phone));
  console.log("");
  console.log(renderMerge("laptop + phone", forward.stats, forward.replica));
  console.log("");
  assertCommutative(forward, backward);
  console.log("the same document in both directions");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
