/**
 * Example 2 - the note that must not be in the report.
 *
 *   node chapters/chapter17/files/02_leak.ts
 *
 * A note titled with a phrase nobody else would write, and an error message that quotes it. The report
 * must contain neither the phrase nor any word long enough to identify it.
 */

import { collect } from "./diagnostics.ts";
import { buildReport, encodeReport } from "./report.ts";
import { assertNoSecrets, redact, secretsOf } from "./redact.ts";

const SECRET = "the safe combination is 44-19-7 and the spare key is under the blue pot";

export function main(): Promise<number> {
  return (async () => {
    const notes = [{ title: "Safe combination", body: `${SECRET} — do not lose this` }];
    const secrets = secretsOf(notes);

    const diagnostics = collect({ storage: true, crypto: true, storageBytes: 900 }, "1.4.0");
    const report = await buildReport({
      diagnostics,
      notes: notes.length,
      tombstones: 0,
      error: { message: `could not open note "Safe combination": ${SECRET}`, at: 1_700_000_000_000 },
      secrets,
    });

    const json = encodeReport(report);
    assertNoSecrets(json, secrets);

    console.log(`secrets           ${secrets.length}`);
    console.log(`report bytes      ${json.length}`);
    console.log(`original message  ${redact(`could not open note "Safe combination": ${SECRET}`, secrets)}`);
    console.log(`secret present    ${json.toLowerCase().includes(SECRET.toLowerCase())}`);
    console.log("");
    console.log("the report quotes the failure and not the note");

    return json.toLowerCase().includes(SECRET.toLowerCase()) ? 1 : 0;
  })();
}

if (import.meta.main) {
  process.exit(await main());
}
