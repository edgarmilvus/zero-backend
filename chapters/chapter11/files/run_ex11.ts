/**
 * Chapter 11 harness: 56 assertions over the vectors, the index, the chunker and the quantization.
 *
 * The model itself is measured in the record, not here: a gate that downloads 23 megabytes is a gate
 * that fails on a plane. The vectors are the model's real output, committed in `embeddings.json`, so
 * everything the chapter claims about search is checked against numbers the model produced.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { NOTES, QUERIES, TOPICS, contentWords, keywordScore } from "./corpus.ts";
import { assertCompatible, buildIndex, searchIndex } from "./index.ts";
import { chunk } from "./chunk.ts";
import { bytesOf, fromInt8, int8Cosine, recallAt, toInt8 } from "./quantize.ts";
import { evaluate, fromJson, loadFixture } from "./fixture.ts";
import { assertBetter } from "./report.ts";
import { cosine, dot, norm, topK } from "./vector.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };
const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => {
  checks.push({ name, run });
};

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}
function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  return true;
}
function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}
const near = (actual: number, expected: number, tolerance: number): boolean =>
  Math.abs(actual - expected) <= tolerance;

// --- the corpus, with no model ------------------------------------------------

check("the corpus has forty notes", () => eq(NOTES.length, 40, "notes"));
check("the notes are in four subjects", () => eq(TOPICS.length, 4, "topics"));
check("each subject has ten notes", () =>
  eq(
    TOPICS.map((topic) => NOTES.filter((note) => note.topic === topic).length).join(","),
    "10,10,10,10",
    "per topic",
  ),
);
check("there are eight questions", () => eq(QUERIES.length, 8, "queries"));
check("every question names a real subject", () =>
  expect(QUERIES.every((query) => (TOPICS as readonly string[]).includes(query.topic)), "unknown topic"),
);
check("the note ids are unique", () => eq(new Set(NOTES.map((note) => note.id)).size, NOTES.length, "ids"));
check("content words drop the stopwords", () =>
  eq(contentWords("the file that the page keeps").join(","), "file,page,keeps", "words"),
);
check("content words are lowercased", () => eq(contentWords("IndexedDB Survives").join(","), "indexeddb,survives", "words"));
check("a keyword score counts the words it finds", () => eq(keywordScore("a page keeps a file", "page file"), 2, "score"));
check("and is zero when a note shares nothing", () =>
  eq(keywordScore("the price of coffee in Milan", "wasm module"), 0, "score"),
);

// --- the vector functions -----------------------------------------------------

const A = Float32Array.from([1, 0, 0]);
const B = Float32Array.from([0, 1, 0]);
const C = Float32Array.from([3, 4, 0]);

check("the dot product of a unit vector with itself is one", () => eq(dot(A, A), 1, "dot"));
check("the length of three-four is five", () => eq(norm(C), 5, "norm"));
check("the cosine of a vector with itself is one", () => near(cosine(C, C), 1, 1e-9));
check("orthogonal vectors have a cosine of zero", () => near(cosine(A, B), 0, 1e-9));
check("cosine does not care about length", () => near(cosine(C, Float32Array.from([6, 8, 0])), 1, 1e-9));
check("a zero vector has no direction and no score", () => eq(cosine(A, new Float32Array(3)), 0, "zero"));
check("mismatched dimensions are refused", () => {
  const error = throwsSync(() => dot(A, Float32Array.from([1, 0])), "dims");
  return expect(error.message.includes("dimensions"), error.message);
});
check("topK is ordered by score", () =>
  eq(
    topK([{ id: "a", score: 0.1 }, { id: "b", score: 0.9 }, { id: "c", score: 0.5 }], 2)
      .map((row) => row.id)
      .join(","),
    "b,c",
    "order",
  ),
);
check("topK breaks a tie by id", () =>
  eq(
    topK([{ id: "z", score: 0.5 }, { id: "a", score: 0.5 }], 2).map((row) => row.id).join(","),
    "a,z",
    "tie",
  ),
);
check("a negative k is refused", () => {
  const error = throwsSync(() => topK([], -1), "negative");
  return expect(error.message.includes("non-negative"), error.message);
});

// --- the chunker --------------------------------------------------------------

const SHORT = "one two three four five";
const LONG = Array.from({ length: 200 }, (_, index) => `w${index}`).join(" ");
const LONG_CHUNKS = chunk(LONG, { words: 60, overlap: 15 });

check("a short text is one chunk", () => eq(chunk(SHORT).length, 1, "chunks"));
check("a long text becomes several", () => expect(LONG_CHUNKS.length > 1, `${LONG_CHUNKS.length}`));
check("the first chunk is exactly the requested words", () => eq(LONG_CHUNKS[0]?.split(" ").length, 60, "words"));
check("consecutive chunks share the overlap", () => {
  const first = LONG_CHUNKS[0]?.split(" ") ?? [];
  const second = LONG_CHUNKS[1]?.split(" ") ?? [];
  return eq(second.slice(0, 15).join(","), first.slice(-15).join(","), "overlap");
});
check("no chunk exceeds the requested size", () =>
  expect(LONG_CHUNKS.every((text) => text.split(" ").length <= 60), "oversized"),
);
check("an overlap as large as the chunk is refused", () => {
  const error = throwsSync(() => chunk(LONG, { words: 10, overlap: 10 }), "overlap");
  return expect(error.message.includes("smaller"), error.message);
});
check("an empty text has no chunks", () => {
  const error = throwsSync(() => chunk("   "), "empty");
  return expect(error.message.includes("empty"), error.message);
});
check("the last chunk ends with the last word", () => expect(LONG_CHUNKS.at(-1)?.endsWith("w199") === true, "tail"));

// --- the fixture --------------------------------------------------------------

const fixture = await loadFixture(join(HERE, "embeddings.json"));

check("the fixture names its model", () =>
  expect(fixture.model.includes("MiniLM"), fixture.model),
);
check("it has the model's dimensions", () => eq(fixture.dims, 384, "dims"));
check("it carries the corpus and the questions", () => {
  eq(fixture.notes.length, 40, "notes");
  return eq(fixture.queries.length, 8, "queries");
});
check("every vector has the declared dimensions", () =>
  expect([...fixture.notes, ...fixture.queries].every((row) => row.vector.length === fixture.dims), "length"),
);
check("every vector is normalized", () =>
  expect([...fixture.notes, ...fixture.queries].every((row) => near(norm(row.vector), 1, 0.01)), "norm"),
);
check("a file with the wrong dimensions is refused", () => {
  const raw = { model: "m", dtype: "q8", dims: 3, notes: [{ id: "a", topic: "db", text: "t", vector: [1, 2] }], queries: [] };
  const error = throwsSync(() => fromJson(raw), "wrong dims");
  return expect(error.message.includes("dimensions"), error.message);
});
check("a file with no model id is refused", () => {
  const raw = { dtype: "q8", dims: 3, notes: [], queries: [] };
  const error = throwsSync(() => fromJson(raw), "no model");
  return expect(error.message.includes("model"), error.message);
});
check("a file with an empty corpus is refused", () => {
  const raw = { model: "m", dtype: "q8", dims: 3, notes: [], queries: [{ id: "q", topic: "db", text: "t", vector: [1, 2, 3] }] };
  const error = throwsSync(() => fromJson(raw), "empty");
  return expect(error.message.includes("empty"), error.message);
});

// --- the search ---------------------------------------------------------------

const evaluation = evaluate(fixture, 5);
const index = buildIndex(fixture.model, fixture.dims, fixture.notes.map((note) => ({
  id: note.id,
  vector: note.vector,
})));

check("meaning beats words by more than twenty points", () =>
  expect(evaluation.semantic >= evaluation.keyword + 0.2, `${evaluation.semantic} against ${evaluation.keyword}`),
);
check("the semantic search finds most of the right subject", () =>
  expect(evaluation.semantic >= 0.6, `${evaluation.semantic}`),
);
check("the evaluation covers every question", () => eq(evaluation.perQuery.length, 8, "queries"));
check("the first question returns only storage notes", () => {
  const first = fixture.queries[0];
  if (!first) throw new Error("no query");
  const hits = searchIndex(index, first.vector, 5);
  return expect(
    hits.filter((hit) => NOTES.find((note) => note.id === hit.id)?.topic === first.topic).length >= 4,
    JSON.stringify(hits.map((hit) => hit.id)),
  );
});
check("a duplicate id is refused when the index is built", () => {
  const error = throwsSync(
    () => buildIndex("m", 3, [{ id: "a", vector: A }, { id: "a", vector: B }]),
    "duplicate",
  );
  return expect(error.message.includes("duplicate"), error.message);
});
check("a vector of the wrong size is refused when the index is built", () => {
  const error = throwsSync(() => buildIndex("m", 3, [{ id: "a", vector: Float32Array.from([1, 2]) }]), "dims");
  return expect(error.message.includes("dimensions"), error.message);
});
check("a query from another model is refused by name", () => {
  const error = throwsSync(() => assertCompatible(index, "other/model", fixture.dims), "model");
  expect(error.message.includes("other/model"), error.message);
  return expect(error.message.includes(fixture.model), error.message);
});
check("a search returns exactly k rows", () => eq(searchIndex(index, fixture.notes[0]!.vector, 3).length, 3, "rows"));
check("every score is a cosine", () =>
  expect(searchIndex(index, fixture.notes[0]!.vector, 40).every((hit) => hit.score >= -1.001 && hit.score <= 1.001), "range"),
);
check("two searches return the same ids in the same order", () => {
  const first = searchIndex(index, fixture.notes[3]!.vector, 5).map((hit) => hit.id).join(",");
  const second = searchIndex(index, fixture.notes[3]!.vector, 5).map((hit) => hit.id).join(",");
  return eq(first, second, "order");
});

// --- the quantization ---------------------------------------------------------

const quantized = fixture.notes.map((note) => toInt8(note.vector));
const exact: { id: string; score: number }[][] = [];
const approximate: { id: string; score: number }[][] = [];
for (const query of fixture.queries) {
  exact.push(searchIndex(index, query.vector, 5));
  const queryBytes = toInt8(query.vector);
  approximate.push(topK(quantized.map((row, at) => ({ id: fixture.notes[at]!.id, score: int8Cosine(queryBytes, row) })), 5));
}

check("int8 keeps the top five", () => expect(recallAt(exact, approximate, 5) >= 0.9, `${recallAt(exact, approximate, 5)}`));
check("int8 is a quarter of the bytes", () => eq(bytesOf(40, "float32") / bytesOf(40, "int8"), 4, "ratio"));
check("an int8 cosine is close to the float one", () => {
  const left = fixture.notes[0]!.vector;
  const right = fixture.notes[1]!.vector;
  return expect(near(int8Cosine(toInt8(left), toInt8(right)), cosine(left, right), 0.02), "error");
});
check("a round trip keeps the direction", () => {
  const vector = fixture.notes[2]!.vector;
  return expect(near(cosine(vector, fromInt8(toInt8(vector))), 1, 0.01), "round trip");
});
check("a perfect approximation has a recall of one", () =>
  eq(recallAt([[{ id: "a", score: 1 }]], [[{ id: "a", score: 1 }]], 1), 1, "recall"),
);
check("recall between result sets of different sizes is refused", () => {
  const error = throwsSync(() => recallAt([[{ id: "a", score: 1 }]], [], 1), "lengths");
  return expect(error.message.includes("result sets"), error.message);
});

// --- the programs -------------------------------------------------------------

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("02 prints the two recalls and the margin", () => {
  const result = run("02_search.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("semantic precision@5"), "semantic line");
  return expect(result.stdout.includes("keyword precision@5"), "keyword line");
});
check("03 prints the bytes and the int8 recall", () => {
  const result = run("03_quantize.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("4x smaller"), result.stdout.slice(0, 200));
  return expect(result.stdout.includes("recall@5"), "recall line");
});
check("04 chunks a long note without cutting the sentence", () => {
  const result = run("04_chunk.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("whole in 1 chunk(s), cut in 0"), result.stdout.slice(-200));
});
check("05 refuses three incompatible queries", () => {
  const result = run("05_stale.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("3 refusals"), result.stdout.slice(-160));
});

// --- run ---------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }

  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${number}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${number}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }

  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
