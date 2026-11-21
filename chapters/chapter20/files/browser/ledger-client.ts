/**
 * The page: the book's ledger, rendered from the JSON the ledger wrote.
 */

type Row = {
  readonly chapter: number;
  readonly id: string;
  readonly statement: string;
  readonly evidence: string;
  readonly ok: boolean;
  readonly value?: number;
};

type Ledger = { readonly chapters: number; readonly rows: readonly Row[] };

export type Summary = {
  readonly rows: number;
  readonly ok: number;
  readonly failed: readonly string[];
};

export async function load(): Promise<Ledger> {
  const response = await fetch("./ledger.json");
  if (!response.ok) throw new Error(`ledger.json: HTTP ${response.status}`);
  return (await response.json()) as Ledger;
}

export function summarize(ledger: Ledger): Summary {
  return {
    rows: ledger.rows.length,
    ok: ledger.rows.filter((row) => row.ok).length,
    failed: ledger.rows.filter((row) => !row.ok).map((row) => row.id),
  };
}

declare global {
  interface Window {
    __ledger: () => Promise<Summary>;
  }
}

if (typeof window !== "undefined") {
  const body = document.querySelector<HTMLTableSectionElement>("#rows");
  const status = document.querySelector<HTMLParagraphElement>("#status");

  const render = (ledger: Ledger): void => {
    if (body) {
      body.innerHTML = ledger.rows
        .map(
          (row) =>
            `<tr class="${row.ok ? "ok" : "bad"}"><td>${row.chapter}</td><td>${row.statement}</td><td class="path">${row.evidence}</td><td>${row.ok ? "ok" : "FAILED"}</td></tr>`,
        )
        .join("");
    }
    const value = summarize(ledger);
    if (status) {
      status.textContent = `${value.ok} of ${value.rows} claims verified across ${ledger.chapters} chapters`;
    }
  };

  void load().then(render).catch((error: Error) => {
    if (status) status.textContent = `failed: ${error.message}`;
  });

  window.__ledger = async () => summarize(await load());
}
