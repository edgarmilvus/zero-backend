/**
 * Triage: five rules, each with a first action a person can take today.
 *
 * The rules are ordered by what they make the product unable to do, not by severity words. A report that
 * cannot store anything is first; a report whose notes are zero with a non-zero store is second; a
 * browser without crypto is third; an import failure is fourth; everything else is a question.
 */

import type { SupportReport } from "./report.ts";

export type Category =
  | "no-storage"
  | "store-not-read"
  | "no-crypto"
  | "import-failed"
  | "share-expired"
  | "unknown";

export type Triage = {
  readonly category: Category;
  readonly firstAction: string;
  readonly severity: "blocker" | "high" | "medium" | "low";
};

export function triage(report: SupportReport): Triage {
  const message = report.error?.message.toLowerCase() ?? "";

  if (!report.env.storage) {
    return {
      category: "no-storage",
      firstAction: "open the file from a normal window, not private mode, and check that site data is allowed",
      severity: "blocker",
    };
  }
  if (report.counts.notes === 0 && report.env.storageBytes > 0) {
    return {
      category: "store-not-read",
      firstAction: "ask for the exported file; the data is probably there under a different origin",
      severity: "high",
    };
  }
  if (!report.env.crypto) {
    return {
      category: "no-crypto",
      firstAction: "update the browser; the share and export need WebCrypto",
      severity: "high",
    };
  }
  if (message.includes("sealed") || message.includes("digest") || message.includes("import")) {
    return {
      category: "import-failed",
      firstAction: "open the file in a text editor and check that the embedded JSON is complete",
      severity: "medium",
    };
  }
  if (message.includes("expired") || message.includes("signature")) {
    return {
      category: "share-expired",
      firstAction: "mint a new link; the old one has lapsed or was edited",
      severity: "low",
    };
  }
  return {
    category: "unknown",
    firstAction: "ask what the user did just before it broke, and for a screenshot of the status line",
    severity: "low",
  };
}

/** One line for a support queue. */
export function describe(triageValue: Triage): string {
  return `${triageValue.severity.padEnd(8)} ${triageValue.category.padEnd(14)} ${triageValue.firstAction}`;
}
