/**
 * Exercise 3 - the scheduler that starved the background.
 *
 * Strict priority means a steady stream of interactive tasks never lets an export start. A ratio admits
 * a background task every few interactive ones, which is a policy a product can defend.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Kind = "interactive" | "background";

/** The bug: background jobs run only when the interactive queue is empty, which never happens. */
export function strict(interactive: number, background: number): Kind[] {
  return [...Array<Kind>(interactive).fill("interactive"), ...Array<Kind>(background).fill("background")];
}

/** The repair: after every `ratio` interactive tasks, one background task is admitted. */
export function ratioed(interactive: number, background: number, ratio: number): Kind[] {
  if (ratio < 1) throw new Error(`ratio: ${ratio} is not a positive count`);
  const out: Kind[] = [];
  let spent = 0;
  let i = 0;
  let b = 0;
  while (i < interactive || b < background) {
    if (i < interactive && (spent < ratio || b >= background)) {
      out.push("interactive");
      i += 1;
      spent += 1;
    } else if (b < background) {
      out.push("background");
      b += 1;
      spent = 0;
    } else {
      out.push("interactive");
      i += 1;
    }
  }
  return out;
}

export function firstBackground(sequence: readonly Kind[]): number {
  return sequence.indexOf("background");
}

export const checks: readonly Check[] = [
  { name: "strict puts no background before the last interactive", run: () => eq(firstBackground(strict(5, 1)), 5, "index") },
  { name: "a ratio of three puts one at index three", run: () => eq(firstBackground(ratioed(5, 1, 3)), 3, "index") },
  { name: "a ratio of one alternates", run: () => eq(ratioed(2, 2, 1).join(","), "interactive,background,interactive,background", "order") },
  { name: "the ratioed sequence keeps every job", run: () => eq(ratioed(5, 3, 3).length, 8, "count") },
  { name: "background jobs all appear", run: () => eq(ratioed(5, 3, 3).filter((kind) => kind === "background").length, 3, "background") },
  { name: "interactive jobs all appear", run: () => eq(ratioed(5, 3, 3).filter((kind) => kind === "interactive").length, 5, "interactive") },
  { name: "a zero ratio is refused", run: () => {
    const error = throws(() => ratioed(1, 1, 0), "zero");
    return expect(error.message.includes("positive"), error.message);
  } },
  { name: "no background jobs leaves the interactive order unchanged", run: () => eq(ratioed(3, 0, 2).join(","), "interactive,interactive,interactive", "order") },
  { name: "no interactive jobs leaves the background order unchanged", run: () => eq(ratioed(0, 3, 2).join(","), "background,background,background", "order") },
  { name: "the ratio does not reorder within a kind", run: () => {
    const sequence = ratioed(4, 2, 2);
    return eq(sequence.filter((kind) => kind === "interactive").length, 4, "count");
  } },
];

export function main(): number {
  console.log(`strict            ${strict(5, 1).join(" ")}`);
  console.log(`ratio 3           ${ratioed(5, 1, 3).join(" ")}`);
  console.log("");
  console.log("strict priority starves; a ratio finishes the export");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
