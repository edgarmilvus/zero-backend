/**
 * Example 3 - the conflict this design loses.
 *
 *   node chapters/chapter13/files/03_conflict.ts
 *
 * Two devices edit the same note while apart. The merge keeps one of them, because the version is the
 * whole note: the chapter's limit, shown rather than described. Which one wins is the later actor name
 * at the same counter, which is stable and arbitrary.
 */

import { createReplica, localWrite, merge } from "./sync.ts";
import { compare } from "./version.ts";
import { read } from "./notes.ts";

export function main(): number {
  let laptop = createReplica("laptop");
  let phone = createReplica("phone");

  laptop = localWrite(laptop, "n1", { title: "Groceries", body: "milk, eggs, bread" });
  // The phone saw the note before the split.
  phone = { name: phone.name, notes: laptop.notes };
  phone = localWrite(phone, "n1", { title: "Groceries", body: "milk, eggs, bread, coffee" });
  laptop = localWrite(laptop, "n1", { title: "Groceries", body: "milk, eggs, bread, apples" });

  const merged = merge(laptop, phone);
  const kept = read(merged.replica.notes)[0];
  const laptopEntry = laptop.notes.get("n1");
  const phoneEntry = phone.notes.get("n1");
  if (!laptopEntry || !phoneEntry) throw new Error("the fixture is wrong");

  const winner = compare(laptopEntry.version, phoneEntry.version) >= 0 ? "laptop" : "phone";
  const loser = winner === "laptop" ? "phone" : "laptop";

  console.log(`laptop            "${laptopEntry.note?.body}" (${laptopEntry.version.counter}:${laptopEntry.version.actor})`);
  console.log(`phone             "${phoneEntry.note?.body}" (${phoneEntry.version.counter}:${phoneEntry.version.actor})`);
  console.log("");
  console.log(`kept              "${kept?.body}" from the ${winner}`);
  console.log(`lost              the ${loser}'s edit, and the merge cannot know it existed`);

  return kept?.body.includes("coffee") || kept?.body.includes("apples") ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main());
}
