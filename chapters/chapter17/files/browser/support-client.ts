/**
 * The page: a user files a report from the app, and the report is built from diagnostics only.
 *
 * The textarea is the error message the app would have shown, and the note phrase is a secret the
 * redactor is given: the page's job is to show that the phrase does not reach the report.
 */

import { collect, probeBrowser } from "../diagnostics.ts";
import { buildReport, encodeReport, type SupportReport } from "../report.ts";
import { assertNoSecrets, secretsOf } from "../redact.ts";
import { renderReport, renderTriage } from "../render.ts";
import { triage, type Triage } from "../triage.ts";

const NOTE = { title: "Safe combination", body: "the spare key is under the blue pot" };

export type PageResult = {
  readonly report: SupportReport;
  readonly value: Triage;
  readonly bytes: number;
  readonly leaked: boolean;
  readonly text: string;
};

export async function fileReport(message: string): Promise<PageResult> {
  const secrets = secretsOf([NOTE]);
  const report = await buildReport({
    diagnostics: collect(probeBrowser(), "1.4.0"),
    notes: 12,
    tombstones: 2,
    error: { message, at: Date.now() },
    secrets,
  });
  const json = encodeReport(report);

  let leaked = true;
  try {
    assertNoSecrets(json, secrets);
    leaked = false;
  } catch {
    leaked = true;
  }

  return {
    report,
    value: triage(report),
    bytes: new TextEncoder().encode(json).byteLength,
    leaked,
    text: `${renderReport(report)}\n\n${renderTriage(triage(report))}`,
  };
}

declare global {
  interface Window {
    __fileReport: (message: string) => Promise<PageResult>;
    __lastReport?: PageResult;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const input = document.querySelector<HTMLTextAreaElement>("#message");
  const button = document.querySelector<HTMLButtonElement>("#send");

  button?.addEventListener("click", () => {
    void (async () => {
      if (status) status.textContent = "building the report...";
      const result = await fileReport(input?.value ?? "could not open a note");
      window.__lastReport = result;
      if (status) {
        status.textContent = result.leaked
          ? "the report contains a note: do not send"
          : `${result.value.severity} ${result.value.category}: ${result.value.firstAction}`;
      }
      if (output) output.textContent = result.text;
    })();
  });

  window.__fileReport = fileReport;
}
