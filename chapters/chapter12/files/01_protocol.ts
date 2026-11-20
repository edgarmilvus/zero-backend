/**
 * Example 1 - the message boundary, without a worker.
 *
 *   node chapters/chapter12/files/01_protocol.ts
 *
 * Three messages a page might send and three it must not: a warm, a batch, an unknown type, an empty
 * text, and a batch larger than the worker takes. The parser is a pure function, which is why this
 * program needs no browser and why the harness can test the boundary.
 */

import { MAX_BATCH, parseRequest, resultBytes } from "./protocol.ts";

export function main(): number {
  const warm = parseRequest({ type: "warm" });
  const embed = parseRequest({ type: "embed", id: 7, texts: ["a note", "another note"] });

  console.log(`warm              ${JSON.stringify(warm)}`);
  console.log(`embed             id ${embed.type === "embed" ? embed.id : "?"}, ${
    embed.type === "embed" ? embed.texts.length : 0
  } texts`);
  console.log(`result on wire    ${(resultBytes(2, 384) / 1024).toFixed(0)} kB for two vectors`);
  console.log("");

  const bad: readonly unknown[] = [
    { type: "shutdown" },
    { type: "embed", id: 1, texts: [] },
    { type: "embed", id: 1, texts: Array.from({ length: MAX_BATCH + 1 }, () => "x") },
  ];

  let refused = 0;
  for (const message of bad) {
    try {
      parseRequest(message);
      console.error(`accepted a message it should refuse: ${JSON.stringify(message)}`);
      return 1;
    } catch (error) {
      refused += 1;
      console.log(`refused           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${refused} refusals before the worker sees a message`);
  return refused === bad.length ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
