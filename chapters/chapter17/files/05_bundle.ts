/**
 * Example 5 - the support bundle, written as one file.
 *
 *   node chapters/chapter17/files/05_bundle.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { collect } from "./diagnostics.ts";
import { buildReport, encodeReport } from "./report.ts";
import { assertNoSecrets, secretsOf } from "./redact.ts";
import { renderBundle } from "./render.ts";
import { triage } from "./triage.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export function main(): Promise<number> {
  return (async () => {
    const notes = [{ title: "Private", body: "a phrase only this user would write: zanzibar-42" }];
    const secrets = secretsOf(notes);
    const report = await buildReport({
      diagnostics: collect({ storage: true, crypto: true, storageBytes: 2_048 }, "1.4.0"),
      notes: notes.length,
      tombstones: 0,
      error: { message: "import failed: the notes were changed after the file was sealed", at: 1 },
      secrets,
    });

    const value = triage(report);
    const html = renderBundle(report, value);
    mkdirSync(join(HERE, "built"), { recursive: true });
    writeFileSync(join(HERE, "built", "support.html"), html);

    // The report is the part that carries note-derived text; the template's own prose is English.
    assertNoSecrets(encodeReport(report), secrets);

    console.log(`bundle            ${new TextEncoder().encode(html).byteLength} bytes`);
    console.log(`triage            ${value.severity} ${value.category}`);
    console.log(`secret present    ${html.includes("zanzibar-42")}`);
    console.log("");
    console.log("one file, no note text, a checksum the recipient can recompute");
    return html.includes("zanzibar-42") ? 1 : 0;
  })();
}

if (import.meta.main) {
  process.exit(await main());
}
