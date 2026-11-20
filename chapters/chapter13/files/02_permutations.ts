/**
 * Example 2 - three devices, six orders, one document.
 *
 *   node chapters/chapter13/files/02_permutations.ts
 *
 * Associativity is what makes a third device possible: merging C into the result of A and B must equal
 * merging B into the result of A and C. The program runs all six orders and compares fingerprints.
 */

import { encode, fingerprint, createReplica, localWrite, merge, type Replica } from "./sync.ts";

const EDITS: readonly { replica: string; id: string; title: string }[] = [
  { replica: "laptop", id: "a1", title: "Merging notes" },
  { replica: "phone", id: "b1", title: "Offline first" },
  { replica: "tablet", id: "c1", title: "A third device" },
];

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

export function main(): number {
  const replicas: Replica[] = EDITS.map((edit) => {
    const replica = localWrite(createReplica(edit.replica), edit.id, { title: edit.title, body: edit.replica });
    return replica;
  });

  const orders = permutations(replicas);
  const results = orders.map((order) => order.reduce((left, right) => merge(left, right).replica));
  const prints = new Set(results.map((replica) => fingerprint(replica)));

  console.log(`replicas          ${replicas.length}`);
  console.log(`orders            ${orders.length}`);
  console.log(`distinct results  ${prints.size}`);
  console.log("");
  console.log(`document          ${results[0] ? Object.keys(encode(results[0]).entries).length : 0} entries`);

  if (prints.size !== 1) {
    console.error("the orders produced different documents");
    return 1;
  }

  console.log("");
  console.log("every order of the same three devices produces the same document");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
