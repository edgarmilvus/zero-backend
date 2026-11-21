/**
 * The book's claims, one per chapter, each pointing at the file that proves it.
 *
 * A claim is a sentence, a record and — when the number matters — a field and a floor. The floor is a
 * threshold and not an equality on purpose: an equality would be a second copy of the record, and the two
 * would drift the day a run is redone.
 */

export type Claim = {
  readonly id: string;
  readonly chapter: number;
  readonly statement: string;
  /** Path from the repository root. */
  readonly evidence: string;
  /** Dotted path inside the record, when the claim is about a number. */
  readonly field?: string;
  /** The floor that number must reach. */
  readonly min?: number;
};

export const CLAIMS: readonly Claim[] = [
  { id: "c01", chapter: 1, statement: "A page can decode and seek a video without downloading all of it", evidence: "runs/chapter01/reel-120mb/record.json" },
  { id: "c02", chapter: 2, statement: "The browser reports what it can do before the feature is written", evidence: "runs/chapter02/capability-profile/profile.json" },
  { id: "c03", chapter: 3, statement: "A file in the origin private file system survives a reload", evidence: "runs/chapter03/opfs-roundtrip/record.json" },
  { id: "c04", chapter: 4, statement: "FFmpeg transcodes a file in a tab, measured", evidence: "runs/chapter04/transcode-fixture/record.json" },
  { id: "c05", chapter: 5, statement: "A clip is cut and re-encoded in the page", evidence: "runs/chapter05/canvas-clip/record.json" },
  { id: "c06", chapter: 6, statement: "An image pipeline runs on the device, with a cold and a warm number", evidence: "runs/chapter06/image-pipeline/record.json" },
  { id: "c07", chapter: 7, statement: "Audio is trimmed and measured against a loudness target", evidence: "runs/chapter07/voice-trim/record.json" },
  { id: "c08", chapter: 8, statement: "A gigabyte in 64 MB chunks costs 76 MB of RSS, against 1,023 whole", evidence: "runs/chapter08/chunked-hash/record.json", field: "megabytesPerSecond", min: 100 },
  { id: "c09", chapter: 9, statement: "Postgres runs in the tab with real transactions", evidence: "runs/chapter09/docs-in-a-tab/record.json", field: "rows", min: 100 },
  { id: "c10", chapter: 10, statement: "A million rows become a 2.4 MB Parquet the engine scans", evidence: "runs/chapter10/analytics-in-a-tab/record.json", field: "node.parquetBytes", min: 1_000_000 },
  { id: "c11", chapter: 11, statement: "Meaning finds more of the right subject than words do", evidence: "runs/chapter11/search-by-meaning/record.json", field: "semantic", min: 0.5 },
  { id: "c12", chapter: 12, statement: "The model loads in a worker while the page keeps painting", evidence: "runs/chapter12/model-in-a-worker/record.json", field: "worker.loadMs", min: 100 },
  { id: "c13", chapter: 13, statement: "Two devices converge without a server", evidence: "runs/chapter13/two-replicas/record.json", field: "notes", min: 2 },
  { id: "c14", chapter: 14, statement: "A permission travels in the fragment and verifies without a request", evidence: "runs/chapter14/share-link/record.json", field: "tokenLength", min: 300 },
  { id: "c15", chapter: 15, statement: "One file carries its notes, its permission and its reader", evidence: "runs/chapter15/one-file/record.json", field: "bytes", min: 1_000 },
  { id: "c16", chapter: 16, statement: "The whole app fits in fourteen kilobytes under a hundred-kilobyte budget", evidence: "runs/chapter16/one-file-app/record.json", field: "bytes", min: 10_000 },
  { id: "c17", chapter: 17, statement: "A support report contains no note text", evidence: "runs/chapter17/support-report/record.json", field: "bytes", min: 100 },
  { id: "c18", chapter: 18, statement: "A pool of four keeps the frame under budget", evidence: "runs/chapter18/worker-pool/record.json", field: "pooled.gap", min: 0 },
  { id: "c19", chapter: 19, statement: "09:00 stays 09:00 across a daylight saving change", evidence: "runs/chapter19/calendar-across-dst/record.json", field: "after", min: 1 },
  { id: "c20", chapter: 20, statement: "Every chapter's claim is checked by a gate that reads its record", evidence: "chapters/chapter20/files/claims.ts" },
];

export function byChapter(chapter: number): readonly Claim[] {
  return CLAIMS.filter((claim) => claim.chapter === chapter);
}

export function ids(): string[] {
  return CLAIMS.map((claim) => claim.id);
}
