/**
 * Chapter 8 harness: 56 assertions on the plan, the loop and the refusals.
 *
 * The readers here are in memory, so the harness never needs a gigabyte: the arithmetic of a plan is
 * the same for 400 bytes and for a terabyte, and the one thing a small fixture cannot show — RSS — is
 * the record's job.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADDRESS_SPACE_BYTES,
  estimatePeakBytes,
  planChunks,
  refuseIfTooBig,
  type AddressSpace,
} from "./plan.ts";
import { chunkedHash, forEachChunk, type Reader } from "./stream.ts";
import { assertBelowBudget, assertSameDigest, renderRun } from "./report.ts";

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
  if (actual !== expected) {
    throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  }
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

/** A reader over a buffer, with the slice convention the plan uses. */
function memory(bytes: Uint8Array): Reader {
  return { size: bytes.byteLength, read: (from, to) => bytes.subarray(from, to) };
}

const DATA = Uint8Array.from({ length: 1000 }, (_, index) => index % 251);
const WHOLE = createHash("sha256").update(DATA).digest("hex");
const SPACE: AddressSpace = { limitBytes: ADDRESS_SPACE_BYTES, budgetBytes: 1e9 };

// --- the plan ---------------------------------------------------------------

check("a file that divides evenly has no partial chunk", () => {
  const plan = planChunks(1000, 250);
  eq(plan.chunks.length, 4, "chunks");
  return eq(plan.chunks.at(-1)?.to, 1000, "last end");
});
check("a file that does not divide evenly has a short last chunk", () => {
  const plan = planChunks(1000, 300);
  const last = plan.chunks.at(-1);
  eq(plan.chunks.length, 4, "chunks");
  return eq(last ? last.to - last.from : -1, 100, "last size");
});
check("no chunk is ever empty", () =>
  expect(planChunks(1000, 300).chunks.every((chunk) => chunk.to > chunk.from), "empty chunk"),
);
check("the chunks cover the file exactly once", () => {
  const plan = planChunks(1000, 300);
  let covered = 0;
  for (const chunk of plan.chunks) covered += chunk.to - chunk.from;
  return eq(covered, 1000, "covered");
});
check("the chunks are contiguous", () => {
  const plan = planChunks(1000, 300);
  for (let index = 1; index < plan.chunks.length; index += 1) {
    if (plan.chunks[index]?.from !== plan.chunks[index - 1]?.to) return false;
  }
  return true;
});
check("a zero-byte file has no chunks", () => eq(planChunks(0, 100).chunks.length, 0, "chunks"));
check("a file smaller than the chunk is one chunk", () =>
  eq(planChunks(50, 100).chunks.length, 1, "chunks"),
);
check("the peak is twice the chunk, and never twice the file", () => {
  eq(planChunks(1e9, 64 * 1024 ** 2).peakBytes, 128 * 1024 ** 2, "chunked");
  return eq(planChunks(1000, 64 * 1024 ** 2).peakBytes, 2000, "small file");
});
check("a zero chunk size is refused", () => {
  const error = throwsSync(() => planChunks(1000, 0), "zero");
  return expect(error.message.includes("positive"), error.message);
});
check("a fractional chunk size is refused", () => {
  const error = throwsSync(() => planChunks(1000, 1.5), "fractional");
  return expect(error.message.includes("integer"), error.message);
});
check("a negative size is refused", () => {
  const error = throwsSync(() => planChunks(-1, 10), "negative");
  return expect(error.message.includes("non-negative"), error.message);
});

check("the chunks are numbered from zero, in order", () =>
  eq(planChunks(1000, 300).chunks.map((chunk) => chunk.index).join(","), "0,1,2,3", "indices"),
);
check("a file that is one chunk has one peak", () =>
  eq(planChunks(100, 300).peakBytes, 200, "peak"),
);
check("a one-byte chunk makes one chunk per byte", () =>
  eq(planChunks(10, 1).chunks.length, 10, "chunks"),
);
check("the plan keeps the size it was asked about", () =>
  eq(planChunks(1000, 300).sizeBytes, 1000, "size"),
);

// --- the refusals -----------------------------------------------------------

check("a file past the address space is refused for that reason", () => {
  const refusal = refuseIfTooBig(6e9, SPACE);
  return expect(refusal?.ceiling.includes("four gigabytes") === true, String(refusal?.ceiling));
});
check("the address-space refusal names the size", () =>
  expect(refuseIfTooBig(6e9, SPACE)?.reason.includes("6.0 GB") === true, "reason"),
);
check("a file that fits the address space but not the budget is refused for the budget", () => {
  const refusal = refuseIfTooBig(2.5e9, SPACE);
  return expect(refusal?.ceiling.includes("budget") === true, String(refusal?.ceiling));
});
check("the budget refusal names both numbers", () => {
  const reason = refuseIfTooBig(2.5e9, SPACE)?.reason ?? "";
  return expect(reason.includes("5.0 GB") && reason.includes("1.0 GB"), reason);
});
check("a file that fits both is allowed", () => eq(refuseIfTooBig(200e6, SPACE), null, "refusal"));
check("the peak estimate doubles the file", () => eq(estimatePeakBytes(1e9), 2e9, "peak"));
check("the peak estimate takes a copy count", () => eq(estimatePeakBytes(1e9, 3), 3e9, "peak"));
check("both refusals point at this chapter", () => {
  eq(refuseIfTooBig(6e9, SPACE)?.fallbackChapter, 8, "space");
  return eq(refuseIfTooBig(2.5e9, SPACE)?.fallbackChapter, 8, "budget");
});

check("a file exactly at the address space passes that wall", () => {
  // The budget still refuses it, so the space gets a budget large enough to isolate the rule.
  const roomy: AddressSpace = { limitBytes: ADDRESS_SPACE_BYTES, budgetBytes: 16e9 };
  return eq(refuseIfTooBig(ADDRESS_SPACE_BYTES, roomy), null, "refusal");
});
check("a file exactly at half the budget is allowed", () => {
  const space: AddressSpace = { limitBytes: ADDRESS_SPACE_BYTES, budgetBytes: 1e9 };
  return eq(refuseIfTooBig(5e8, space), null, "refusal");
});
check("an empty file needs no memory", () => eq(estimatePeakBytes(0), 0, "peak"));

// --- the loop ---------------------------------------------------------------

check("the chunked digest equals the whole-file digest", async () => {
  const result = await chunkedHash(memory(DATA), 300);
  return eq(result.digest, WHOLE, "digest");
});
check("the byte count is the file's size", async () =>
  eq((await chunkedHash(memory(DATA), 300)).bytes, 1000, "bytes"),
);
check("the chunk count follows the plan", async () =>
  eq((await chunkedHash(memory(DATA), 300)).chunks, 4, "chunks"),
);
check("the largest read is the chunk size", async () =>
  eq((await chunkedHash(memory(DATA), 300)).largestChunkBytes, 300, "largest"),
);
check("the largest read of a short file is the file", async () =>
  eq((await chunkedHash(memory(DATA), 5000)).largestChunkBytes, 1000, "largest"),
);
check("a reader that returns too few bytes is caught by index", async () => {
  const bad: Reader = { size: 1000, read: (from, to) => DATA.subarray(from, Math.max(from, to - 1)) };
  try {
    await chunkedHash(bad, 300);
    return false;
  } catch (error) {
    return expect((error as Error).message.includes("chunk 0"), (error as Error).message);
  }
});
check("an empty file hashes to the empty digest", async () => {
  const result = await chunkedHash(memory(new Uint8Array(0)), 300);
  return eq(result.digest, createHash("sha256").digest("hex"), "digest");
});
check("a one-byte chunk still produces the right digest", async () =>
  eq((await chunkedHash(memory(DATA), 1)).digest, WHOLE, "digest"),
);
check("the loop visits every byte once", async () => {
  const seen: number[] = [];
  const total = await forEachChunk(memory(DATA), 300, (_chunk, data) => {
    seen.push(data.byteLength);
  });
  eq(total, 1000, "total");
  return eq(seen.join(","), "300,300,300,100", "sizes");
});
check("forEachChunk hands the caller the chunk's own range", async () => {
  let first = -1;
  await forEachChunk(memory(DATA), 300, (chunk) => {
    if (first < 0) first = chunk.from;
  });
  return eq(first, 0, "first");
});

check("the result carries the plan it executed", async () => {
  const result = await chunkedHash(memory(DATA), 300);
  return eq(result.plan.chunkBytes, 300, "chunkBytes");
});
check("the wall clock is a number and not a guess", async () => {
  const result = await chunkedHash(memory(DATA), 300);
  return expect(Number.isFinite(result.wallClockMs) && result.wallClockMs >= 0, "clock");
});
check("two runs produce the same digest", async () => {
  const a = await chunkedHash(memory(DATA), 300);
  const b = await chunkedHash(memory(DATA), 137);
  return eq(a.digest, b.digest, "digest");
});
check("a reader that returns too many bytes is caught", async () => {
  const generous: Reader = { size: 1000, read: (from, to) => new Uint8Array(to - from + 1) };
  try {
    await chunkedHash(generous, 300);
    return false;
  } catch (error) {
    return expect((error as Error).message.includes("asked for"), (error as Error).message);
  }
});
check("forEachChunk accepts an async visit", async () => {
  let count = 0;
  await forEachChunk(memory(DATA), 500, async () => {
    await Promise.resolve();
    count += 1;
  });
  return eq(count, 2, "visits");
});
check("forEachChunk over an empty file visits nothing", async () =>
  eq(await forEachChunk(memory(new Uint8Array(0)), 300, () => {}), 0, "bytes"),
);

// --- the report -------------------------------------------------------------

check("the rendered run names the chunk count and the largest read", async () => {
  const result = await chunkedHash(memory(DATA), 300);
  const line = renderRun("test", 1000, result);
  expect(line.includes("4 chunks"), line);
  return expect(line.includes("MB each") || line.includes("0 MB each"), line);
});
check("a read exceeding the budget fails the assertion", async () => {
  const result = await chunkedHash(memory(DATA), 300);
  const error = throwsSync(() => assertBelowBudget(result, 100), "over budget");
  return expect(error.message.includes("exceeds"), error.message);
});
check("a read inside the budget passes", async () =>
  expect(assertBelowBudget(await chunkedHash(memory(DATA), 300), 1000) === undefined, "threw"),
);
check("two equal digests pass", () => expect(assertSameDigest(WHOLE, WHOLE) === undefined, "threw"));
check("two different digests fail, with both prefixes", () => {
  const error = throwsSync(() => assertSameDigest(WHOLE, "0".repeat(64)), "mismatch");
  return expect(error.message.includes(WHOLE.slice(0, 16)), error.message);
});

// --- the programs -----------------------------------------------------------

const run = (script: string, args: readonly string[] = []) =>
  spawnSync(process.execPath, [join(HERE, script), ...args], { encoding: "utf8" });

check("the rendered run reports a throughput", async () => {
  const line = renderRun("test", 1000, await chunkedHash(memory(DATA), 300));
  return expect(line.includes("MB/s"), line);
});
check("a read exactly at the budget passes the assertion", async () =>
  expect(assertBelowBudget(await chunkedHash(memory(DATA), 300), 300) === undefined, "threw"),
);
check("the mismatch message names both digests", () => {
  const error = throwsSync(() => assertSameDigest("a".repeat(64), "b".repeat(64)), "mismatch");
  expect(error.message.includes("a".repeat(16)), "chunked");
  return expect(error.message.includes("b".repeat(16)), "whole");
});
check("03 with a chunk larger than the file reads it in one go", () => {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-ex8b-"));
  const path = join(dir, "small.bin");
  writeFileSync(path, Buffer.alloc(1024, 7));
  const result = spawnSync(process.execPath, [join(HERE, "03_hash_chunked.ts"), path, "64"], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("chunks           1"), result.stdout);
});
check("01 prints a plan at four chunk sizes", () => {
  const result = run("01_plan_a_gigabyte.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("chunks"), result.stdout);
});
check("04 refuses 6 GB and 2.5 GB for different reasons", () => {
  const result = run("04_refuse_the_impossible.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("four gigabytes"), "address space");
  return expect(result.stdout.includes("budget"), "budget");
});
check("05 trades reads against memory", () => {
  const result = run("05_choose_a_chunk.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("calls"), result.stdout);
});
check("02 and 03 agree on a real file's digest", () => {
  const dir = mkdtempSync(join(tmpdir(), "zero-backend-ex8-"));
  const path = join(dir, "sample.bin");
  const bytes = Buffer.alloc(5 * 1024 * 1024);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251;
  writeFileSync(path, bytes);

  const whole = spawnSync(process.execPath, [join(HERE, "02_hash_whole.ts"), path], { encoding: "utf8" });
  const chunked = spawnSync(process.execPath, [join(HERE, "03_hash_chunked.ts"), path, "1"], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });

  eq(whole.status ?? -1, 0, `whole exited ${whole.status} ${whole.stderr}`);
  eq(chunked.status ?? -1, 0, `chunked exited ${chunked.status} ${chunked.stderr}`);

  const digestOf = (text: string): string => text.split("\n").find((line) => line.startsWith("digest")) ?? "";
  return eq(digestOf(chunked.stdout), digestOf(whole.stdout), "digests");
});
check("a reader that throws stops the loop with its own error", async () => {
  const broken: Reader = {
    size: 1000,
    read: (from) => {
      throw new Error(`disk gone at ${from}`);
    },
  };
  try {
    await chunkedHash(broken, 300);
    return false;
  } catch (error) {
    return expect((error as Error).message.includes("disk gone at 0"), (error as Error).message);
  }
});

// --- run --------------------------------------------------------------------

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
