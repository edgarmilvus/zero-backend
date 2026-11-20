/**
 * Example 1 - probe this machine, and print the rungs.
 *
 *   node chapters/chapter02/files/01_detect_here.ts
 *
 * In node most of this is absent and one capability is blocked, which is the first lesson:
 * a probe that runs in the wrong environment does not fail, it reports a small profile.
 */

import { detectCapabilities } from "./detect.ts";
import { probe } from "./probe.ts";
import {
  assertTwelveCapabilities,
  assertVerdictsNotGuessed,
  renderJson,
  renderTable,
} from "./report.ts";

export function main(argv: readonly string[] = []): number {
  const caps = detectCapabilities();
  const profile = probe(caps);

  assertTwelveCapabilities(profile);
  assertVerdictsNotGuessed(profile, caps);

  if (argv.includes("--json")) {
    console.log(
      renderJson(profile, {
        measuredAt: new Date().toISOString(),
        engine: `node ${process.version}`,
        crossOriginIsolated: caps.crossOriginIsolated,
        userAgent: "",
      }),
    );
    return 0;
  }

  console.log(`engine            node ${process.version}`);
  console.log(`cross-origin iso  ${caps.crossOriginIsolated}`);
  console.log(`shared array buf  ${caps.sharedArrayBuffer}`);
  console.log("");
  console.log(renderTable(profile));
  console.log("");
  console.log(
    `this machine reaches tier ${profile.tier}: ${
      profile.tier === 0 ? "the page runs, nothing more" : "see the table for the gaps"
    }`,
  );

  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
