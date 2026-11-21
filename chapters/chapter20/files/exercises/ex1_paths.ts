/**
 * Exercise 1 - the claim whose file moved.
 *
 * An absolute path works on the machine that wrote it and nowhere else. The ledger resolves every path
 * against the repository root and refuses one that climbs out of it.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export function resolve(root: string, path: string): string {
  if (path.startsWith("/")) throw new Error(`path: ${path} is absolute`);
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) throw new Error(`path: ${path} escapes the root`);
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${root}/${parts.join("/")}`;
}

export const checks: readonly Check[] = [
  { name: "a relative path resolves under the root", run: () => eq(resolve("/book", "runs/a/record.json"), "/book/runs/a/record.json", "path") },
  { name: "a leading dot is ignored", run: () => eq(resolve("/book", "./runs/a.json"), "/book/runs/a.json", "path") },
  { name: "an inner dot-dot cancels a segment", run: () => eq(resolve("/book", "runs/x/../a.json"), "/book/runs/a.json", "path") },
  { name: "an absolute path is refused", run: () => {
    const error = throws(() => resolve("/book", "/etc/passwd"), "absolute");
    return expect(error.message.includes("absolute"), error.message);
  } },
  { name: "a climbing path is refused", run: () => {
    const error = throws(() => resolve("/book", "../../etc/passwd"), "escape");
    return expect(error.message.includes("escapes"), error.message);
  } },
  { name: "one climb from the root is refused", run: () => expect(throws(() => resolve("/book", "../x"), "escape").message.includes("escapes"), "message") },
  { name: "an empty path resolves to the root", run: () => eq(resolve("/book", ""), "/book/", "root") },
  { name: "a name is not a climb", run: () => eq(resolve("/book", "a..b/c"), "/book/a..b/c", "path") },
];

export function main(): number {
  console.log(`relative          ${resolve("/book", "runs/a.json")}`);
  try {
    resolve("/book", "../x");
  } catch (error) {
    console.log(`climbing          ${(error as Error).message}`);
  }
  console.log("");
  console.log("a path in a book is relative to the book, or it is a path on someone's laptop");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
