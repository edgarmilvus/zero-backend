/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 * Reads an inventory, asks the core what is waiting and what is done, and refuses when the
 * files do not fit the budget. The shortest of the three files, because the sum lives in the
 * schema and the queue lives in the core.
 *
 *   node chapters/chapter03/files/exercises/ex5_capstone.ts <inventory.json>
 */

import { enqueue, newState, pending, step } from "./queue_core.ts";
import { normalize, readInventory } from "./storage_record.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_capstone.ts <inventory.json>");
    return 2;
  }

  let inventory;
  try {
    inventory = readInventory(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const totals = normalize(inventory);
  const queue = inventory.files.reduce(
    (state, file) => enqueue(state, file.name),
    newState(4),
  );
  const after = step(queue);

  console.log(`store            ${totals.store}`);
  console.log(`budget           ${totals.budgetBytes.toLocaleString("en-US")} bytes`);
  console.log(`files            ${totals.fileCount}`);
  console.log(`total            ${totals.totalBytes.toLocaleString("en-US")} bytes`);
  console.log(`queue            ${pending(queue)} pending, ${after.done.length} started`);
  console.log(`first started    ${after.done.join(", ") || "none"}`);
  console.log("");

  if (totals.totalBytes > totals.budgetBytes) {
    console.error(
      `refused: ${totals.totalBytes} bytes do not fit ${totals.budgetBytes}`,
    );
    return 1;
  }

  console.log("the inventory fits the budget, and the app can list it");
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
