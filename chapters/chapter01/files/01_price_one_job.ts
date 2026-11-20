/**
 * Example 1 - price one job on the server path.
 *
 * Before comparing anything, the bill has to be taken apart. Four line items,
 * one total, and the share each of them holds. On a media pipeline the answer is
 * almost always the same, and it is almost never the one people guess.
 *
 *   node chapters/chapter01/files/01_price_one_job.ts
 */

import { formatRow, priceServer, serverRow, usd } from "./ledger.ts";
import { REEL } from "./reel.ts";
import { TARIFF_2026_11 } from "./tariff.ts";

const percent = (part: number, whole: number): string =>
  whole === 0 ? "0%" : `${((part / whole) * 100).toFixed(1)}%`;

export function main(): number {
  const tariff = TARIFF_2026_11;
  const breakdown = priceServer(REEL, tariff);

  console.log(`tariff        ${tariff.id}`);
  console.log(`read on       ${tariff.source.readOn}`);
  console.log(`workload      ${REEL.id}`);
  console.log(`             ${REEL.label}`);
  console.log("");
  console.log(`requests      ${usd(breakdown.requestsUsd).padStart(10)}  ${percent(breakdown.requestsUsd, breakdown.totalUsd)}`);
  console.log(`compute       ${usd(breakdown.computeUsd).padStart(10)}  ${percent(breakdown.computeUsd, breakdown.totalUsd)}`);
  console.log(`egress        ${usd(breakdown.egressUsd).padStart(10)}  ${percent(breakdown.egressUsd, breakdown.totalUsd)}`);
  console.log(`storage       ${usd(breakdown.storageUsd).padStart(10)}  ${percent(breakdown.storageUsd, breakdown.totalUsd)}`);
  console.log(`-----------------------------------------`);
  console.log(`per job       ${usd(breakdown.totalUsd).padStart(10)}`);
  console.log(`per 1,000     ${usd(breakdown.totalUsd * 1000).padStart(10)}`);
  console.log("");
  console.log(formatRow(serverRow(REEL, tariff)));

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
