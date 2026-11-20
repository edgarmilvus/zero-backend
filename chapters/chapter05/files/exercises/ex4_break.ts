/**
 * Exercise 4 - the codec this browser does not have.
 *
 * An AV1 file meets a Chrome without AV1 in hardware. `VideoDecoder.isConfigSupported` answers
 * `supported: false`, the page calls `configure` anyway, and the job fails with a string about a
 * configuration nobody can act on. The repair is the same three-field refusal the book uses for
 * every ceiling.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

/** What a platform reports, as a table the page can consult before it decodes anything. */
export const PLATFORM = new Map<string, boolean>([
  ["avc1.640015", true],
  ["hvc1.1.6.L93.B0", false],
  ["vp09.00.10.08", true],
  ["av01.0.04M.08", false],
]);

export type Refusal = {
  readonly reason: string;
  readonly ceiling: string;
  readonly fallbackChapter: number;
};

/** The bug: configure and hope, reporting only what the platform says when it says no. */
export function trustThePlatform(codec: string): string | null {
  return PLATFORM.get(codec) === true ? null : "configure failed";
}

/** The repair: ask, and refuse with a reason before the first byte is decoded. */
export function supportFor(codec: string): { supported: boolean; why: string } {
  const supported = PLATFORM.get(codec);
  if (supported === undefined) {
    return { supported: false, why: `this platform has never heard of ${codec}` };
  }
  if (!supported) {
    return { supported: false, why: `${codec} is a codec this build does not decode` };
  }
  return { supported: true, why: `${codec} is in the platform's list` };
}

export function refusalFor(codec: string): Refusal | null {
  const { supported, why } = supportFor(codec);
  if (supported) return null;
  return {
    reason: why,
    ceiling: "the platform's decoder list, which the page cannot change and the user cannot install",
    fallbackChapter: 4,
  };
}

export const checks: readonly Check[] = [
  {
    name: "a supported codec has no refusal",
    run: () => eq(refusalFor("avc1.640015"), null, "refusal"),
  },
  {
    name: "a codec the build lacks is refused",
    run: () => expect(refusalFor("av01.0.04M.08") !== null, "no refusal"),
  },
  {
    name: "the reason names the codec",
    run: () => expect(refusalFor("av01.0.04M.08")?.reason.includes("av01") === true, "reason"),
  },
  {
    name: "the ceiling names the platform list",
    run: () => expect(refusalFor("av01.0.04M.08")?.ceiling.includes("platform") === true, "ceiling"),
  },
  {
    name: "the fallback points at the chapter with the ported codec",
    run: () => eq(refusalFor("av01.0.04M.08")?.fallbackChapter, 4, "chapter"),
  },
  {
    name: "a codec nobody has heard of is a different sentence",
    run: () => expect(supportFor("wat1").why.includes("never heard"), "why"),
  },
  {
    name: "the buggy path returns an error after the fact",
    run: () => eq(trustThePlatform("av01.0.04M.08"), "configure failed", "error"),
  },
  {
    name: "the buggy path gives the same sentence for a codec nobody knows",
    run: () => eq(trustThePlatform("wat1"), "configure failed", "same error"),
  },
  {
    name: "the table is consulted before the decode",
    run: () => {
      const order: string[] = [];
      order.push("ask");
      if (refusalFor("hvc1.1.6.L93.B0")) order.push("abort");
      else order.push("decode");
      return eq(order.join(","), "ask,abort", "order");
    },
  },
];

export function main(): number {
  for (const codec of PLATFORM.keys()) {
    const { supported, why } = supportFor(codec);
    console.log(`${codec.padEnd(18)} ${supported ? "supported" : "refused  "}  ${why}`);
  }
  console.log("");
  console.log("the platform's list is the ceiling; the ported codec is the fallback");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
