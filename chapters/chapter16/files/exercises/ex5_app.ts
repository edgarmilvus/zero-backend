/**
 * Exercise 5, file 3 of 3 - the wiring.
 *
 *   node chapters/chapter16/files/exercises/ex5_app.ts <app.json>
 */

import { normalize, readApp } from "./app_record.ts";
import { live, requireTitle, search } from "./model_core.ts";

export function main(argv: readonly string[]): number {
  const path = argv[0];
  if (!path) {
    console.error("usage: ex5_app.ts <app.json>");
    return 2;
  }

  let record;
  try {
    record = readApp(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const numbers = normalize(record);
  const title = requireTitle("A note");
  const notes = [{ id: "a", title, body: "the body", updatedAt: 1 }];

  console.log(`bytes            ${record.bytes}, ${(numbers.share * 100).toFixed(0)} per cent of ${record.budget}`);
  console.log(`modules          ${record.modules}, ${numbers.perModule.toFixed(0)} bytes each`);
  console.log(`notes            ${record.notes}, live ${live(notes).length}`);
  console.log(`search           ${search(notes, "body").length} hit(s)`);
  console.log(`verdict          ${record.verdict}`);

  return record.verdict === "fits" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
