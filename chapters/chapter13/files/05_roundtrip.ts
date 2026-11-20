/**
 * Example 5 - the wire, and three payloads a decoder must refuse.
 *
 *   node chapters/chapter13/files/05_roundtrip.ts
 *
 * A state-based protocol is a file format: anything can arrive, and a decoder that trusts it is a
 * replica with two notes claiming the same id or a counter that is a string.
 */

import { createReplica, decode, encode, fingerprint, localWrite } from "./sync.ts";

export function main(): number {
  const replica = localWrite(createReplica("laptop"), "n1", { title: "A note", body: "with a body" });
  const wire = JSON.parse(JSON.stringify(encode(replica)));
  const back = decode(wire);

  console.log(`encoded           ${Object.keys(encode(replica).entries).length} entries`);
  console.log(`round trip        ${fingerprint(back) === fingerprint(replica) ? "identical" : "different"}`);

  const bad: readonly unknown[] = [
    { name: "", entries: {} },
    { name: "phone", entries: { n1: { version: { counter: 0, actor: "phone" }, note: null } } },
    { name: "phone", entries: { n1: { version: { counter: 1, actor: "phone" }, note: { title: 4 } } } },
  ];

  let refused = 0;
  for (const payload of bad) {
    try {
      decode(payload);
      console.error(`accepted a payload it should refuse: ${JSON.stringify(payload)}`);
      return 1;
    } catch (error) {
      refused += 1;
      console.log(`refused           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${refused} refusals before a bad state reaches a merge`);
  return refused === bad.length && fingerprint(back) === fingerprint(replica) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
