/**
 * What the chapter prints.
 */

import type { FixtureNote } from "./fixture.ts";
import type { Scored } from "./vector.ts";

export type Hit = Scored & { readonly note: FixtureNote };

export function renderSearch(query: string, hits: readonly Hit[], wallClockMs: number): string {
  const lines = [`query             "${query}" in ${wallClockMs.toFixed(2)} ms`];
  for (const hit of hits) {
    lines.push(
      `  ${hit.score.toFixed(3).padStart(6)}  ${hit.note.id.padEnd(4)} ${hit.note.topic.padEnd(8)} ${hit.note.text.slice(0, 64)}`,
    );
  }
  return lines.join("\n");
}

export function renderEvaluation(evaluation: { semantic: number; keyword: number }, k: number): string {
  return [
    `semantic precision@${k} ${(evaluation.semantic * 100).toFixed(0)} per cent`,
    `keyword precision@${k}  ${(evaluation.keyword * 100).toFixed(0)} per cent`,
    `difference          ${((evaluation.semantic - evaluation.keyword) * 100).toFixed(0)} points`,
  ].join("\n");
}

/** A search that is not better than a keyword scan is a model that was not worth its download. */
export function assertBetter(evaluation: { semantic: number; keyword: number }, margin = 0.2): void {
  if (evaluation.semantic <= evaluation.keyword + margin) {
    throw new Error(
      `semantic ${(evaluation.semantic * 100).toFixed(0)} per cent against keyword ` +
        `${(evaluation.keyword * 100).toFixed(0)}: the margin is under ${(margin * 100).toFixed(0)} points`,
    );
  }
}

export function renderBytes(bytes: { float32: number; int8: number }): string {
  return [
    `float32           ${(bytes.float32 / 1024).toFixed(0)} kB for the corpus`,
    `int8              ${(bytes.int8 / 1024).toFixed(0)} kB for the corpus`,
    `ratio             ${(bytes.float32 / bytes.int8).toFixed(0)}x smaller`,
  ].join("\n");
}
