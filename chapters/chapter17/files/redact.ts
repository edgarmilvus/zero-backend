/**
 * Redaction: a whitelist of keys, and a scrub of the strings that do survive.
 *
 * The whitelist is the first half: a report is built from named fields, so a new field has to be added
 * here before it can leave. The scrub is the second: an error message can quote a note title, and a
 * message is a string like any other.
 */

export type Secret = string;

/** Every title and body, plus the words long enough to identify one. */
export function secretsOf(notes: readonly { title: string; body: string }[]): Secret[] {
  const words = new Set<string>();
  for (const note of notes) {
    for (const text of [note.title, note.body]) {
      const trimmed = text.trim();
      if (trimmed.length >= 3) words.add(trimmed);
      for (const word of trimmed.split(/\s+/)) {
        // Six is where a word stops being English and starts identifying: "this" is not a secret,
        // "zanzibar" is. The full title and body are in the list regardless of length.
        if (word.length >= 5) words.add(word);
      }
    }
  }
  return [...words].sort((left, right) => right.length - left.length);
}

/**
 * Replaces every secret with `[redacted]`, longest first so a phrase is not half-replaced by one of its
 * words. The comparison is case-insensitive and the replacement keeps the sentence readable.
 */
export function redact(text: string, secrets: readonly Secret[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length < 3) continue;
    const pattern = new RegExp(escapeRegExp(secret), "gi");
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The assertion the chapter is built on: nothing that came from a note may be in the report. */
export function assertNoSecrets(report: string, secrets: readonly Secret[]): void {
  const lower = report.toLowerCase();
  for (const secret of secrets) {
    if (secret.length < 3) continue;
    if (lower.includes(secret.toLowerCase())) {
      throw new Error(`report: leaked "${secret.slice(0, 24)}"`);
    }
  }
}
