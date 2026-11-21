/**
 * Exercise 4 - the comma that split a title.
 *
 * A SUMMARY containing a comma, a semicolon or a newline is a different event after a round trip unless
 * the text is escaped and unescaped. The comma separates list items; the semicolon separates parameters.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function unescape(text: string): string {
  return text.replace(/\\([\\;,nN])/g, (_match, character: string) => (character === "n" || character === "N" ? "\n" : character));
}

/** The bug: split on every comma, which is what an unescaped summary forces. */
export function splitNaive(line: string): string[] {
  return line.split(",");
}

export const checks: readonly Check[] = [
  { name: "a comma is escaped", run: () => eq(escape("a,b"), "a\\,b", "escaped") },
  { name: "a semicolon is escaped", run: () => eq(escape("a;b"), "a\\;b", "escaped") },
  { name: "a newline becomes backslash-n", run: () => eq(escape("a\nb"), "a\\nb", "escaped") },
  { name: "a backslash is doubled", run: () => eq(escape("a\\b"), "a\\\\b", "escaped") },
  { name: "a round trip returns the title", run: () => eq(unescape(escape("Standup, with a comma; and a semicolon\nand a line")), "Standup, with a comma; and a semicolon\nand a line", "round trip") },
  { name: "the naive split breaks an escaped comma", run: () => eq(splitNaive("SUMMARY:a\\,b").length, 2, "split") },
  { name: "the naive split does not break an escaped semicolon", run: () => eq(splitNaive("SUMMARY:a\\;b").length, 1, "split") },
  { name: "an unknown escape keeps its backslash", run: () => eq(unescape("a\\zb"), "a\\zb", "unknown") },
  { name: "escaping is idempotent on clean text", run: () => eq(escape(escape("abc")), "abc", "clean") },
];

export function main(): number {
  console.log(`title             ${JSON.stringify("Standup, with a comma; and a semicolon")}`);
  console.log(`escaped           ${escape("Standup, with a comma; and a semicolon")}`);
  console.log(`back              ${unescape(escape("Standup, with a comma; and a semicolon"))}`);
  console.log("");
  console.log("a comma in a title is a separator unless it is escaped");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
