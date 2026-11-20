/**
 * Exercise 4 - the message that was almost right.
 *
 * A `postMessage` boundary accepts anything. A message with a string id, a missing batch or a text
 * that is a number produces a model call with the wrong shape, and the error arrives a hundred lines
 * away from the mistake.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Command = { readonly kind: "warm" } | { readonly kind: "embed"; readonly id: number; readonly texts: string[] };

export function decode(raw: unknown): Command {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("message: expected an object");
  const message = raw as Record<string, unknown>;

  if (message.kind === "warm") return { kind: "warm" };
  if (message.kind !== "embed") throw new Error(`message.kind: unknown ${String(message.kind)}`);
  if (typeof message.id !== "number" || !Number.isInteger(message.id) || message.id < 1) {
    throw new Error("message.id: expected a positive integer");
  }
  if (!Array.isArray(message.texts) || message.texts.length === 0) throw new Error("message.texts: expected at least one");
  if (message.texts.length > 32) throw new Error("message.texts: at most 32 per message");
  if (!message.texts.every((text) => typeof text === "string" && text.trim() !== "")) {
    throw new Error("message.texts: every text must be a non-empty string");
  }
  return { kind: "embed", id: message.id, texts: [...(message.texts as string[])] };
}

export const checks: readonly Check[] = [
  { name: "a warm is a command", run: () => eq(decode({ kind: "warm" }).kind, "warm", "kind") },
  { name: "an embed keeps its id", run: () => {
    const command = decode({ kind: "embed", id: 4, texts: ["a"] });
    return eq(command.kind === "embed" ? command.id : 0, 4, "id");
  } },
  { name: "an unknown kind is refused", run: () => {
    const error = throws(() => decode({ kind: "stop" }), "kind");
    return expect(error.message.includes("unknown"), error.message);
  } },
  { name: "a string id is refused", run: () => {
    const error = throws(() => decode({ kind: "embed", id: "4", texts: ["a"] }), "id");
    return expect(error.message.includes("positive integer"), error.message);
  } },
  { name: "a missing batch is refused", run: () => {
    const error = throws(() => decode({ kind: "embed", id: 1 }), "batch");
    return expect(error.message.includes("at least one"), error.message);
  } },
  { name: "a batch of 33 is refused", run: () => {
    const error = throws(() => decode({ kind: "embed", id: 1, texts: Array.from({ length: 33 }, () => "x") }), "33");
    return expect(error.message.includes("32"), error.message);
  } },
  { name: "a number in the batch is refused", run: () => {
    const error = throws(() => decode({ kind: "embed", id: 1, texts: [1] }), "number");
    return expect(error.message.includes("string"), error.message);
  } },
  { name: "the decode copies the batch", run: () => {
    const texts = ["a"];
    const command = decode({ kind: "embed", id: 1, texts });
    texts.push("b");
    return eq(command.kind === "embed" ? command.texts.length : 0, 1, "copy");
  } },
  { name: "an array is not a message", run: () => {
    const error = throws(() => decode(["warm"]), "array");
    return expect(error.message.includes("object"), error.message);
  } },
];

export function main(): number {
  console.log(`decoded           ${JSON.stringify(decode({ kind: "embed", id: 2, texts: ["a note"] }))}`);
  try {
    decode({ kind: "embed", id: 2, texts: [] });
  } catch (error) {
    console.log(`refused           ${(error as Error).message}`);
  }
  console.log("");
  console.log("the boundary is where a type stops existing, and the decoder is where it comes back");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
