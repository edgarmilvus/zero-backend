/**
 * Example 4 - what the bill looks like at volume, and when moving it pays.
 *
 * The server path has a per-job cost and a floor: on-call, a queue, monitoring.
 * The client path has no floor once it ships, and one cost that never appears on
 * a monthly bill: the engineering to build it. Dividing one by the other gives
 * the only number a CTO will ask for.
 *
 *   node chapters/chapter01/files/04_extrapolate_at_scale.ts
 */

import { breakEven, priceServer, usd } from "./ledger.ts";
import { REEL } from "./reel.ts";
import { TARIFF_2026_11 } from "./tariff.ts";

/** One day of a senior engineer's time, and the services around the queue. */
export const BUILD_COST_USD = 4000;
export const FIXED_MONTHLY_USD = 1200;

const VOLUMES = [100, 1_000, 10_000, 100_000, 1_000_000];

export function main(): number {
  const tariff = TARIFF_2026_11;
  const { totalUsd } = priceServer(REEL, tariff);
  const paybackJobs = Math.ceil(BUILD_COST_USD / totalUsd);

  console.log(`server cost per job     ${usd(totalUsd)}`);
  console.log(`per 1,000 jobs          ${usd(totalUsd * 1000)}`);
  console.log(`fixed monthly floor     ${usd(FIXED_MONTHLY_USD)}`);
  console.log(`client build, one-off   ${usd(BUILD_COST_USD)}`);
  console.log("");
  console.log(`moving this job to the client pays for itself after`);
  console.log(`  ${paybackJobs.toLocaleString("en-US")} jobs, at the tariff of ${tariff.source.readOn}`);
  console.log("");
  console.log(
    "jobs/month".padStart(12),
    "server".padStart(12),
    "client".padStart(10),
    "payback".padStart(12),
    "  verdict",
  );
  for (const jobs of VOLUMES) {
    const monthly = FIXED_MONTHLY_USD + jobs * totalUsd;
    const months = paybackJobs / jobs;
    const payback = months >= 1 ? `${months.toFixed(0)} months` : "<1 month";
    const verdict = months <= 12 ? "move it" : "leave it";
    console.log(
      jobs.toLocaleString("en-US").padStart(12),
      usd(monthly).padStart(12),
      usd(0).padStart(10),
      payback.padStart(12),
      `  ${verdict}`,
    );
  }

  console.log("");
  const budget = breakEven(REEL, tariff, 500);
  console.log(
    `at a ${usd(500)}/month budget the server path runs ` +
      `${budget.jobsPerMonth.toFixed(0)} jobs before it is out of money`,
  );

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
