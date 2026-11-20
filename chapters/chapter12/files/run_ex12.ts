/**
 * Chapter 12 harness: 56 assertions over the boundary, the queue, the frames and the manifest.
 *
 * The model itself is not loaded here. A gate that compiles 23 MB of WebAssembly is a gate that takes
 * a minute and needs a network, so the chapter tests the parts around the model and the record holds
 * the page's own numbers.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_BATCH, assertResult, parseRequest, resultBytes } from "./protocol.ts";
import { SerialQueue } from "./queue.ts";
import { fps, maxGap, summarize } from "./frames.ts";
import { assertSameModel, validateManifest } from "./manifest.ts";
import { assertWorkerKeepsPainting, renderEmbed, renderLoad } from "./report.ts";
import { rewriteSpecifiers } from "./browser/serve.mjs";

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

// --- the protocol -------------------------------------------------------------

check("a warm message parses", () => eq(parseRequest({ type: "warm" }).type, "warm", "type"));
check("an embed message keeps its id and texts", () => {
  const request = parseRequest({ type: "embed", id: 7, texts: ["a", "b"] });
  if (request.type !== "embed") throw new Error("not an embed");
  eq(request.id, 7, "id");
  return eq(request.texts.length, 2, "texts");
});
check("an unknown type is refused", () => {
  const error = throwsSync(() => parseRequest({ type: "shutdown" }), "type");
  return expect(error.message.includes("unknown"), error.message);
});
check("a missing id is refused", () => {
  const error = throwsSync(() => parseRequest({ type: "embed", texts: ["a"] }), "id");
  return expect(error.message.includes("positive integer"), error.message);
});
check("an id of zero is refused", () => expect(throwsSync(() => parseRequest({ type: "embed", id: 0, texts: ["a"] }), "zero").message.length > 0, "no message"));
check("an empty batch is refused", () => {
  const error = throwsSync(() => parseRequest({ type: "embed", id: 1, texts: [] }), "empty");
  return expect(error.message.includes("at least one"), error.message);
});
check("a batch over the limit is refused", () => {
  const error = throwsSync(
    () => parseRequest({ type: "embed", id: 1, texts: Array.from({ length: MAX_BATCH + 1 }, () => "x") }),
    "batch",
  );
  return expect(error.message.includes(String(MAX_BATCH)), error.message);
});
check("an empty string in a batch is refused", () => {
  const error = throwsSync(() => parseRequest({ type: "embed", id: 1, texts: ["a", "  "] }), "blank");
  return expect(error.message.includes("empty text"), error.message);
});
check("a number where a text belongs is refused", () => {
  const error = throwsSync(() => parseRequest({ type: "embed", id: 1, texts: [42] }), "number");
  return expect(error.message.includes("string"), error.message);
});
check("a batch over the character limit is refused", () => {
  const error = throwsSync(
    () => parseRequest({ type: "embed", id: 1, texts: ["x".repeat(4_001)] }),
    "characters",
  );
  return expect(error.message.includes("characters"), error.message);
});
check("a warm message carries no id", () => eq(JSON.stringify(parseRequest({ type: "warm" })), '{"type":"warm"}', "shape"));
check("the parser copies the texts it accepts", () => {
  const texts = ["a"];
  const request = parseRequest({ type: "embed", id: 1, texts });
  texts.push("b");
  return eq(request.type === "embed" ? request.texts.length : 0, 1, "copy");
});
check("a result costs four bytes per dimension", () => eq(resultBytes(2, 384), 3_072, "bytes"));
check("a result with the wrong number of vectors is refused", () => {
  const error = throwsSync(() => assertResult(2, [new Float32Array(384)], 384), "count");
  return expect(error.message.includes("vectors"), error.message);
});
check("a result with the wrong width is refused", () => {
  const error = throwsSync(() => assertResult(1, [new Float32Array(768)], 384), "width");
  return expect(error.message.includes("dimensions"), error.message);
});
check("a good result passes", () =>
  expect(assertResult(1, [new Float32Array(384)], 384) === undefined, "threw"),
);

// --- the queue ----------------------------------------------------------------

check("the queue runs tasks in the order they arrived", async () => {
  const queue = new SerialQueue();
  const order: number[] = [];
  await Promise.all([0, 1, 2].map((index) => queue.push(async () => void order.push(index))));
  return eq(order.join(","), "0,1,2", "order");
});
check("two tasks never run at once", async () => {
  const queue = new SerialQueue();
  let running = 0;
  let overlap = false;
  await Promise.all(
    Array.from({ length: 5 }, () =>
      queue.push(async () => {
        running += 1;
        if (running > 1) overlap = true;
        await new Promise((resolve) => setTimeout(resolve, 1));
        running -= 1;
      }),
    ),
  );
  return eq(overlap, false, "overlap");
});
check("the deepest queue is the number of waiting tasks", async () => {
  const queue = new SerialQueue();
  const all = Array.from({ length: 4 }, () => queue.push(async () => undefined));
  await Promise.all(all);
  return eq(queue.maxDepth, 4, "depth");
});

check("an idle queue has nothing pending", () => eq(new SerialQueue().pending, 0, "pending"));
check("pending returns to zero after the batch", async () => {
  const queue = new SerialQueue();
  await Promise.all([1, 2, 3].map(() => queue.push(async () => undefined)));
  return eq(queue.pending, 0, "pending");
});
check("a failed task does not stop the next one", async () => {
  const queue = new SerialQueue();
  const first = queue.push(async () => {
    throw new Error("boom");
  });
  const second = queue.push(async () => "done");
  await first.catch(() => undefined);
  return eq(await second, "done", "second");
});
check("results come back in the order the tasks were pushed", async () => {
  const queue = new SerialQueue();
  const all = await Promise.all([3, 1, 2].map((value) => queue.push(async () => value)));
  return eq(all.join(","), "3,1,2", "results");
});

// --- the frames ---------------------------------------------------------------

check("an empty trace has no gap", () => eq(maxGap([]), 0, "gap"));
check("a single stamp has no gap", () => eq(maxGap([10]), 0, "gap"));
check("the gap is between consecutive stamps", () => eq(maxGap([0, 16, 50]), 34, "gap"));
check("the window's end counts as a stamp", () => {
  const stats = summarize([16, 33], 0, 600);
  return eq(stats.maxGapMs, 567, "gap");
});
check("a window with no frames is one long gap", () => eq(summarize([], 0, 50).maxGapMs, 50, "gap"));
check("the frame count is the recorded frames", () => eq(summarize([16, 33, 50], 0, 60).frames, 3, "frames"));
check("fps is frames over the window", () => eq(Math.round(fps({ frames: 60, maxGapMs: 16 }, 1_000)), 60, "fps"));
check("a zero window has no fps", () => eq(fps({ frames: 10, maxGapMs: 1 }, 0), 0, "fps"));
check("a window that ends before it starts is refused", () => {
  const error = throwsSync(() => summarize([], 10, 5), "window");
  return expect(error.message.includes("before"), error.message);
});

// --- the manifest -------------------------------------------------------------

const MANIFEST = JSON.parse(readFileSync(join(HERE, "model.json"), "utf8")) as unknown;

check("the committed manifest validates", () => eq(validateManifest(MANIFEST).dims, 384, "dims"));
check("its total is the sum of its files", () => {
  const manifest = validateManifest(MANIFEST);
  return eq(manifest.totalBytes, manifest.files.reduce((sum, file) => sum + file.bytes, 0), "total");
});
check("a missing config is refused", () => {
  const raw = { ...(MANIFEST as object), files: [{ path: "tokenizer.json", bytes: 1 }] } as unknown;
  const error = throwsSync(() => validateManifest(raw), "config");
  return expect(error.message.includes("config.json"), error.message);
});
check("a missing weights file is refused", () => {
  const raw = {
    ...(MANIFEST as object),
    files: [
      { path: "config.json", bytes: 1 },
      { path: "tokenizer.json", bytes: 1 },
    ],
  } as unknown;
  const error = throwsSync(() => validateManifest(raw), "onnx");
  return expect(error.message.includes("model_quantized.onnx"), error.message);
});
check("a total that disagrees with the files is refused", () => {
  const raw = { ...(MANIFEST as object), totalBytes: 1 } as unknown;
  const error = throwsSync(() => validateManifest(raw), "total");
  return expect(error.message.includes("sum to"), error.message);
});
check("zero dimensions are refused", () => {
  const raw = { ...(MANIFEST as object), dims: 0 } as unknown;
  const error = throwsSync(() => validateManifest(raw), "dims");
  return expect(error.message.includes("positive"), error.message);
});
check("an unknown dtype is refused", () => {
  const raw = { ...(MANIFEST as object), dtype: "int4" } as unknown;
  const error = throwsSync(() => validateManifest(raw), "dtype");
  return expect(error.message.includes("q8 or fp32"), error.message);
});
check("a zero-byte file is refused", () => {
  const raw = {
    ...(MANIFEST as object),
    files: [
      { path: "config.json", bytes: 0 },
      { path: "tokenizer.json", bytes: 1 },
      { path: "onnx/model_quantized.onnx", bytes: 1 },
    ],
  } as unknown;
  const error = throwsSync(() => validateManifest(raw), "zero bytes");
  return expect(error.message.includes("positive integer"), error.message);
});
check("an empty file list is refused", () => {
  const raw = { ...(MANIFEST as object), files: [] } as unknown;
  const error = throwsSync(() => validateManifest(raw), "no files");
  return expect(error.message.includes("at least one"), error.message);
});
check("a manifest from another model is refused by name", () => {
  const manifest = validateManifest(MANIFEST);
  const error = throwsSync(() => assertSameModel(manifest, "Xenova/bge-small-en", manifest.dims), "model");
  expect(error.message.includes("Xenova/bge-small-en"), error.message);
  return expect(error.message.includes(manifest.model), error.message);
});

// --- the specifier rewrite ----------------------------------------------------

const SOURCE = 'import { a } from "onnxruntime-common"; import { b } from "onnxruntime-web/webgpu"; import "x" from "@huggingface/transformers";';

check("the common package becomes an absolute path", () =>
  expect(rewriteSpecifiers(SOURCE).includes("/vendor/onnxruntime-common/dist/esm/index.js"), "common"),
);
check("the webgpu entry becomes an absolute path", () =>
  expect(rewriteSpecifiers(SOURCE).includes("/vendor/onnxruntime-web/dist/ort.webgpu.min.mjs"), "webgpu"),
);
check("the self reference becomes an absolute path", () =>
  expect(rewriteSpecifiers(SOURCE).includes("/vendor/@huggingface/transformers/dist/transformers.web.js"), "self"),
);
check("the rewrite leaves the rest of the source alone", () => {
  const rewritten = rewriteSpecifiers(SOURCE);
  return expect(rewritten.includes('import { a } from "/vendor/onnxruntime-common'), "structure");
});
check("no bare specifier survives, with or without a space", () => {
  const rewritten = rewriteSpecifiers('from"onnxruntime-web/webgpu" and from "onnxruntime-common"');
  return expect(!/from\s*"onnxruntime-(common|web\/webgpu)"/.test(rewritten), rewritten);
});

// --- the report ---------------------------------------------------------------

check("the load rendering states the time and the frame", () => {
  const text = renderLoad("worker", 1009, { frames: 61, maxGapMs: 16.7 });
  expect(text.includes("1009 ms"), "time");
  return expect(text.includes("17 ms"), text);
});
check("the embed rendering states dimensions and bytes", () => {
  const text = renderEmbed("a note", 98, 384, 1536);
  expect(text.includes("384 dimensions"), "dims");
  return expect(text.includes("2 kB"), text);
});
check("a worker that kept painting passes the comparison", () =>
  expect(assertWorkerKeepsPainting({ frames: 61, maxGapMs: 16.7 }, { frames: 17, maxGapMs: 614 }) === undefined, "threw"),
);
check("a main thread that did not stall is refused, because the fixture proves nothing", () => {
  const error = throwsSync(
    () => assertWorkerKeepsPainting({ frames: 10, maxGapMs: 16 }, { frames: 10, maxGapMs: 20 }),
    "no stall",
  );
  return expect(error.message.includes("did not stall"), error.message);
});

// --- the programs -------------------------------------------------------------

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 refuses three malformed messages", () => {
  const result = run("01_protocol.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("3 refusals"), result.stdout.slice(-120));
});
check("02 runs five tasks in order without overlap", () => {
  const result = run("02_queue.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("deepest queue     5"), result.stdout);
  return expect(result.stdout.includes("task 0, task 1"), result.stdout);
});
check("03 shows the freeze that a naive monitor misses", () => {
  const result = run("03_frames.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("miss all of it"), result.stdout.slice(-160));
});
check("04 validates the committed manifest", () => {
  const result = run("04_manifest.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("model_quantized.onnx"), result.stdout);
});
check("05 decides whether to warm, and says no when there is nothing to search", () => {
  const result = run("05_warm.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("never searches: false"), result.stdout);
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
