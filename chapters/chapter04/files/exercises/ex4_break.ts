/**
 * Exercise 4 - the filter this build does not have.
 *
 * A command asks for a filter the browser build omits. The job downloads 31 MB, writes 120 MB
 * into MEMFS, and then fails with "Error initializing filtergraph" because the name is not in
 * the build's table. The user has waited a minute for an error they cannot act on.
 *
 * The repair is a table of what the build has, checked before the download.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

/** The filters this chapter's build is known to carry, from its own configuration output. */
export const AVAILABLE = new Set([
  "scale",
  "crop",
  "fps",
  "transpose",
  "hflip",
  "vflip",
  "format",
  "drawtext",
  "overlay",
  "atempo",
  "volume",
  "aresample",
]);

/** The bug: trust the command. */
export function trustTheCommand(filters: readonly string[]): readonly string[] {
  return filters;
}

/** The repair: name the filters the build does not carry. */
export function missingFilters(filters: readonly string[]): readonly string[] {
  return filters.filter((name) => !AVAILABLE.has(name));
}

/** A refusal with the three fields the book uses everywhere. */
export function refusalFor(filters: readonly string[]): {
  reason: string;
  ceiling: string;
  fallbackChapter: number;
} | null {
  const missing = missingFilters(filters);
  if (missing.length === 0) return null;
  return {
    reason: `the build does not carry ${missing.join(", ")}, and the command needs it`,
    ceiling: "the filter set compiled into this WebAssembly build, which is fixed at build time",
    fallbackChapter: 5,
  };
}

export const checks: readonly Check[] = [
  {
    name: "a filter in the build is not reported missing",
    run: () => eq(missingFilters(["scale", "fps"]).length, 0, "missing"),
  },
  {
    name: "a filter outside it is reported by name",
    run: () => eq(missingFilters(["scale", "libplacebo"]).join(","), "libplacebo", "missing"),
  },
  {
    name: "the buggy version reports nothing, which is the failure",
    run: () => eq(trustTheCommand(["libplacebo"]).length, 1, "trusted"),
  },
  {
    name: "the refusal names the filter",
    run: () => expect(refusalFor(["libplacebo"])?.reason.includes("libplacebo") === true, "reason"),
  },
  {
    name: "the refusal names the ceiling",
    run: () => expect(refusalFor(["libplacebo"])?.ceiling.includes("build") === true, "ceiling"),
  },
  {
    name: "the refusal points at the chapter that avoids the build",
    run: () => eq(refusalFor(["libplacebo"])?.fallbackChapter, 5, "chapter"),
  },
  {
    name: "a command with no missing filter has no refusal",
    run: () => eq(refusalFor(["scale"]), null, "refusal"),
  },
  {
    name: "several missing filters are all named",
    run: () => {
      const refusal = refusalFor(["scale", "libplacebo", "zscale"]);
      expect(refusal?.reason.includes("libplacebo") === true, "libplacebo");
      return expect(refusal?.reason.includes("zscale") === true, "zscale");
    },
  },
  {
    name: "the table is checked before the bytes, not after",
    run: () => {
      const order: string[] = [];
      const filters = ["scale", "fps"];
      order.push("check");
      if (missingFilters(filters).length > 0) order.push("abort");
      else order.push("download");
      return eq(order.join(","), "check,download", "order");
    },
  },
];

export function main(): number {
  const filters = ["scale", "libplacebo"];
  console.log(`filters          ${filters.join(", ")}`);
  console.log(`missing          ${missingFilters(filters).join(", ") || "none"}`);
  const refusal = refusalFor(filters);
  if (refusal) {
    console.log("");
    console.log(`reason           ${refusal.reason}`);
    console.log(`ceiling          ${refusal.ceiling}`);
    console.log(`fallback         chapter ${refusal.fallbackChapter}`);
  }
  console.log("");
  console.log("a filter table costs one line; the download costs a minute and an error");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
