/**
 * Example 5 - the arithmetic a reader should do before the 31 MB download.
 *
 *   node chapters/chapter04/files/05_estimate_before_running.ts
 *
 * An output is roughly bitrate times duration, and a bitrate is a decision rather than a fact.
 * Doing the multiplication first tells a reader whether the job fits the memory they have, and
 * whether the client path is a saving or a slow way to do nothing.
 */

import { formatBytes } from "./report.ts";

export type Estimate = {
  readonly durationSeconds: number;
  readonly videoBitrateKbps: number;
  readonly audioBitrateKbps: number;
  readonly inputBytes: number;
  readonly budgetBytes: number;
};

/** Container overhead is a few per cent; 4 per cent is close enough for a decision. */
export function estimateOutputBytes(estimate: Estimate): number {
  const bits = (estimate.videoBitrateKbps + estimate.audioBitrateKbps) * 1000 * estimate.durationSeconds;
  return Math.round((bits / 8) * 1.04);
}

export type Verdict = "fits" | "tight" | "refuse";

/**
 * Three answers, because the interesting case is the middle one.
 *
 * A job needs the input and the output in MEMFS at the same time. Under half the budget is
 * comfortable, under the whole budget is possible and fragile, over it is a refusal before the
 * download rather than an error after it.
 */
export function decide(estimate: Estimate): Verdict {
  const needed = estimate.inputBytes + estimateOutputBytes(estimate);
  if (needed > estimate.budgetBytes) return "refuse";
  if (needed > estimate.budgetBytes * 0.5) return "tight";
  return "fits";
}

const CASES: readonly Estimate[] = [
  { durationSeconds: 2, videoBitrateKbps: 1000, audioBitrateKbps: 96, inputBytes: 34_267, budgetBytes: 256e6 },
  { durationSeconds: 120, videoBitrateKbps: 2500, audioBitrateKbps: 128, inputBytes: 120e6, budgetBytes: 256e6 },
  { durationSeconds: 1800, videoBitrateKbps: 2500, audioBitrateKbps: 128, inputBytes: 540e6, budgetBytes: 256e6 },
];

export function main(): number {
  console.log(
    `${"duration".padEnd(10)}${"output".padStart(12)}${"input".padStart(12)}${"needed".padStart(12)}  verdict`,
  );
  console.log(`${"-".repeat(10)}${"-".repeat(12)}${"-".repeat(12)}${"-".repeat(12)}  -------`);

  for (const estimate of CASES) {
    const output = estimateOutputBytes(estimate);
    const needed = estimate.inputBytes + output;
    console.log(
      `${`${estimate.durationSeconds}s`.padEnd(10)}${formatBytes(output).padStart(12)}` +
        `${formatBytes(estimate.inputBytes).padStart(12)}${formatBytes(needed).padStart(12)}  ` +
        `${decide(estimate)}`,
    );
  }

  console.log("");
  console.log("bitrate x duration is the estimate; the memory a job needs is the input plus the output");
  console.log("the third row is the one to refuse before the download, not after");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
