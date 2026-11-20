/**
 * The profile as a table, as markdown, and as a record.
 *
 * Three renderings because the profile is read three ways: in a terminal during a build, in
 * the book as a figure somebody can argue with, and in a file that a second machine can be
 * compared against.
 */

import { CAPABILITIES } from "./capabilities.ts";
import { formatVerdict, type Capabilities, type Profile } from "./probe.ts";

const NAME = 26;
const TIER = 5;
const VERDICT = 9;

/** The terminal table: one line per capability, tier first so the groups read as rungs. */
export function renderTable(profile: Profile): string {
  const lines = [
    `${"tier".padEnd(TIER)}${"capability".padEnd(NAME)}${"verdict".padEnd(VERDICT)}chapter`,
    `${"-".repeat(TIER)}${"-".repeat(NAME)}${"-".repeat(VERDICT)}-------`,
  ];

  const ordered = [...profile.reports].sort((a, b) => a.tier - b.tier);
  for (const report of ordered) {
    lines.push(
      `${String(report.tier).padEnd(TIER)}${report.id.padEnd(NAME)}${formatVerdict(
        report.verdict,
      ).padEnd(VERDICT)}${report.chapter}`,
    );
  }

  lines.push("");
  lines.push(`tier reached      ${profile.tier} of 3`);
  lines.push(
    `blocked chapters  ${
      profile.blockedChapters.length === 0 ? "none" : profile.blockedChapters.join(", ")
    }`,
  );
  return lines.join("\n");
}

/** The markdown table, for the record and for the page. */
export function renderMarkdown(profile: Profile): string {
  const header = "| tier | capability | verdict | chapter | what the book does instead |";
  const rule = "| --- | --- | --- | --- | --- |";
  const rows = [...profile.reports]
    .sort((a, b) => a.tier - b.tier)
    .map(
      (report) =>
        `| ${report.tier} | ${report.id} | ${formatVerdict(report.verdict)} | ${
          report.chapter
        } | ${report.verdict === "present" ? "" : report.fallback} |`,
    );
  return [header, rule, ...rows].join("\n");
}

/** The profile as a record, with the provenance that makes two profiles comparable. */
export function renderJson(
  profile: Profile,
  meta: {
    readonly measuredAt: string;
    readonly engine: string;
    readonly crossOriginIsolated: boolean;
    readonly userAgent: string;
  },
): string {
  return JSON.stringify(
    {
      chapter: 2,
      measuredAt: meta.measuredAt,
      engine: meta.engine,
      crossOriginIsolated: meta.crossOriginIsolated,
      userAgent: meta.userAgent,
      tier: profile.tier,
      blockedChapters: profile.blockedChapters,
      capabilities: profile.reports.map((report) => ({
        id: report.id,
        tier: report.tier,
        verdict: report.verdict,
        why: report.why,
        chapter: report.chapter,
        fallback: report.fallback,
      })),
    },
    null,
    2,
  );
}

/** Twelve capabilities, one tier each, or the table is not the book's table. */
export function assertTwelveCapabilities(profile: Profile): void {
  if (profile.reports.length !== CAPABILITIES.length) {
    throw new Error(
      `profile has ${profile.reports.length} capabilities, the list has ${CAPABILITIES.length}`,
    );
  }
  const ids = new Set(profile.reports.map((report) => report.id));
  if (ids.size !== profile.reports.length) {
    throw new Error("profile has a duplicate capability id");
  }
}

/**
 * The rule the chapter is named after: nothing is reported present that was not probed.
 *
 * `threads` is the one derived verdict, so it is checked against the two raw facts it is
 * derived from rather than against a `present` entry that does not exist.
 */
export function assertVerdictsNotGuessed(profile: Profile, caps: Capabilities): void {
  for (const report of profile.reports) {
    if (report.verdict !== "present") continue;

    if (report.id === "threads") {
      if (!caps.sharedArrayBuffer || !caps.crossOriginIsolated) {
        throw new Error(
          "threads reported present without SharedArrayBuffer and cross-origin isolation",
        );
      }
      continue;
    }

    if (caps.present[report.id] !== true) {
      throw new Error(`${report.id} reported present, but the probe did not return true`);
    }
  }
}
