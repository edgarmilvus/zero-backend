/**
 * Exercise 1 - the report that quoted the note.
 *
 * The report's fields are counts and booleans; the only free text is the error message, and an error
 * message is where a note title ends up. Redacting the fields and not the message is a leak with a
 * tidy schema.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Secret = string;

export function secretsOf(notes: readonly { title: string; body: string }[]): Secret[] {
  const out = new Set<string>();
  for (const note of notes) {
    for (const text of [note.title, note.body]) {
      const trimmed = text.trim();
      if (trimmed.length >= 3) out.add(trimmed);
      for (const word of trimmed.split(/\s+/)) if (word.length >= 5) out.add(word);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

export function redact(text: string, secrets: readonly Secret[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 3) continue;
    out = out.replace(new RegExp(escapeRegExp(secret), "gi"), "[redacted]");
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NOTES = [{ title: "Safe combination", body: "the spare key is under the blue pot" }];
const SECRETS = secretsOf(NOTES);

export const checks: readonly Check[] = [
  { name: "the title is a secret", run: () => expect(SECRETS.includes("Safe combination"), "title") },
  { name: "a long word from the body is a secret", run: () => expect(SECRETS.includes("spare"), SECRETS.join(",")) },
  { name: "the message loses the title", run: () => eq(redact('could not open "Safe combination"', SECRETS).includes("Safe combination"), false, "leak") },
  { name: "the message loses the body word", run: () => eq(redact("the spare key failed", SECRETS).includes("spare"), false, "leak") },
  { name: "redaction is case-insensitive", run: () => eq(redact("SAFE COMBINATION", SECRETS).toLowerCase().includes("safe combination"), false, "case") },
  { name: "a message with no secret is unchanged", run: () => eq(redact("disk full", SECRETS), "disk full", "text") },
  { name: "a regex character is literal", run: () => eq(redact("a.b*c", secretsOf([{ title: "a.b*c", body: "" }])).includes("[redacted]"), true, "regex") },
  { name: "the numbered part of the body is not a secret", run: () => expect(!SECRETS.includes("42"), "number") },
];

export function main(): number {
  console.log(`secrets           ${SECRETS.join(" | ")}`);
  console.log(`message           ${redact('could not open "Safe combination": the spare key is missing', SECRETS)}`);
  console.log("");
  console.log("an error message is a field the user did not write, and it quotes the note");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
