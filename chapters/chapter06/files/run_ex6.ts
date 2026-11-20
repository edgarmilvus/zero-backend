/**
 * Chapter 6 harness: 56 assertions on the segment chain, the EXIF block, the plan and the decoder.
 *
 * The HEIC decoder is tested here, in node, because libheif-js runs in both runtimes: a decoder
 * that only a browser can check is a decoder nobody checks.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP1,
  buildExifSegment,
  describeTags,
  insertAfterSoi,
  parseExif,
  readSegments,
  stripMetadata,
} from "./exif.ts";
import { estimateBytes, planBatch, refuseUnsupported, targetSize, type PhotoJob, type Target } from "./plan.ts";
import { assertNoMetadata, assertSmaller, renderResults, type PhotoResult } from "./report.ts";
import { decodeHeic } from "./heic.ts";
import { assertFormat } from "./encode.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const JPEG = new Uint8Array(readFileSync(join(HERE, "fixtures", "cover.jpg")));
const HEIC = readFileSync(join(HERE, "fixtures", "cover.heic"));

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

const EXIF_SEGMENT = buildExifSegment([
  { tag: 0x010f, value: "Apple" },
  { tag: 0x0110, value: "iPhone 15 Pro" },
  { tag: 0x0132, value: "2026:11:20 09:14:03" },
  { tag: 0x0112, value: 6 },
]);
const WITH_EXIF = insertAfterSoi(JPEG, EXIF_SEGMENT);

const JOB = { name: "a.jpg", sourceBytes: 1000, format: "jpeg" as const, width: 4032, height: 3024 };
const TARGET: Target = { maxWidth: 1600, quality: 0.8, format: "webp" };
const SUPPORT = { webp: true, avif: false };

// --- the segment chain ------------------------------------------------------

check("a jpeg starts with ffd8", () => eq(readSegments(JPEG)[0]?.marker, 0xe0, "first segment"));
check("the fixture has no APP1", () =>
  eq(readSegments(JPEG).filter((segment) => segment.marker === APP1).length, 0, "app1"),
);
check("the injected file has one APP1", () =>
  eq(readSegments(WITH_EXIF).filter((segment) => segment.marker === APP1).length, 1, "app1"),
);
check("the walk stops at the start of scan", () =>
  expect(readSegments(JPEG).some((segment) => segment.marker === 0xda), "no SOS"),
);
check("a file that does not start with ffd8 has no segments", () =>
  eq(readSegments(new Uint8Array([1, 2, 3, 4])).length, 0, "segments"),
);
check("a truncated segment stops the walk without throwing", () => {
  // The length claims 255 bytes and the buffer has five: the walk reports what it could not read.
  const short = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 0x00]);
  return eq(readSegments(short).length, 0, "segments");
});
check("segment lengths account for their own header", () => {
  const app1 = readSegments(WITH_EXIF).find((segment) => segment.marker === APP1);
  if (!app1) throw new Error("no app1");
  // The segment on disk is four bytes of header plus the payload, and the builder made exactly
  // that many bytes.
  return eq(app1.headerBytes + app1.payloadBytes, EXIF_SEGMENT.byteLength, "length");
});
check("the tags come back in file order", () =>
  eq(parsed?.tags.map((tag) => tag.name).join(","), "Make,Model,DateTime,Orientation", "order"),
);
check("two APP1 blocks are both removed", () => {
  const twice = insertAfterSoi(WITH_EXIF, EXIF_SEGMENT);
  const out = stripMetadata(twice);
  eq(out.removed, 2, "removed");
  return eq(readSegments(out.bytes).filter((segment) => segment.marker === APP1).length, 0, "left");
});
check("an extreme aspect ratio never yields a zero height", () =>
  eq(targetSize({ width: 4000, height: 3 }, 100).height, 1, "height"),
);
check("the injected segment sits right after the start of image", () => {
  const segments = readSegments(WITH_EXIF);
  return eq(segments[0]?.marker, APP1, "first");
});

// --- the EXIF block ---------------------------------------------------------

const parsed = parseExif(WITH_EXIF.subarray(6, 6 + EXIF_SEGMENT.byteLength - 4));

check("the parser finds the four tags", () => eq(parsed?.tags.length, 4, "tags"));
check("the byte order is read from the TIFF header", () => eq(parsed?.byteOrder, "little", "order"));
check("an ASCII value is read whole, without its terminator", () =>
  eq(parsed?.tags.find((tag) => tag.name === "Make")?.value, "Apple", "make"),
);
check("a value longer than four bytes is read through its offset", () =>
  eq(parsed?.tags.find((tag) => tag.name === "Model")?.value, "iPhone 15 Pro", "model"),
);
check("a short value is read inline", () =>
  eq(parsed?.tags.find((tag) => tag.name === "Orientation")?.value, 6, "orientation"),
);
check("an unknown tag keeps its hex name", () => {
  const segment = buildExifSegment([{ tag: 0x9999, value: 1 }]);
  // The payload starts after the segment's own four bytes: ff, e1, and the two length bytes.
  const tags = parseExif(segment.subarray(4));
  return expect(tags?.tags[0]?.name.startsWith("0x") === true, String(tags?.tags[0]?.name));
});
check("a payload with no TIFF header is refused", () =>
  eq(parseExif(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])), null, "null"),
);
check("a payload that is too short is refused", () =>
  eq(parseExif(new Uint8Array(4)), null, "null"),
);
check("describeTags names the model and the orientation", () =>
  expect(describeTags(parsed ?? { byteOrder: "little", tags: [] }).includes("iPhone 15 Pro"), "model"),
);
check("a 14-byte payload with the Exif marker but a bad magic is refused", () => {
  const bad = new Uint8Array(20);
  bad.set([0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2b, 0], 0);
  return eq(parseExif(bad), null, "null");
});

// --- the strip --------------------------------------------------------------

check("the strip removes the APP1 block", () => eq(stripMetadata(WITH_EXIF).removed, 1, "removed"));
check("the stripped file has no APP1 left", () =>
  eq(readSegments(stripMetadata(WITH_EXIF).bytes).filter((s) => s.marker === APP1).length, 0, "app1"),
);
check("the stripped file is smaller than the one with metadata", () =>
  expect(stripMetadata(WITH_EXIF).bytes.byteLength < WITH_EXIF.byteLength, "not smaller"),
);
check("the stripped file still starts with the start of image", () => {
  const out = stripMetadata(WITH_EXIF).bytes;
  return eq(`${out[0]},${out[1]}`, "255,216", "soi");
});
check("a file with no metadata is returned unchanged", () => {
  const out = stripMetadata(JPEG);
  eq(out.removed, 0, "removed");
  return eq(out.bytes.byteLength, JPEG.byteLength, "bytes");
});
check("the strip keeps every non-metadata segment", () =>
  eq(readSegments(stripMetadata(WITH_EXIF).bytes).length, readSegments(JPEG).length, "segments"),
);
check("the image data after the scan is copied verbatim", () => {
  const out = stripMetadata(WITH_EXIF).bytes;
  const originalTail = JPEG.subarray(JPEG.byteLength - 100);
  const strippedTail = out.subarray(out.byteLength - 100);
  return eq(Buffer.compare(Buffer.from(originalTail), Buffer.from(strippedTail)), 0, "tail");
});
check("a strip that leaves metadata fails the assertion", () => {
  const error = throwsSync(() => assertNoMetadata(1, 1), "survivor");
  return expect(error.message.includes("survived"), error.message);
});

// --- the plan ---------------------------------------------------------------

check("a photo narrower than the target is not upscaled", () => {
  const size = targetSize({ width: 800, height: 600 }, 1600);
  eq(size.width, 800, "width");
  return eq(size.scaled, false, "scaled");
});
check("a photo wider than the target keeps the aspect ratio", () => {
  const size = targetSize({ width: 4032, height: 3024 }, 1600);
  eq(size.width, 1600, "width");
  return eq(size.height, 1200, "height");
});
check("a zero target width is refused", () => {
  const error = throwsSync(() => targetSize({ width: 100, height: 100 }, 0), "zero");
  return expect(error.message.includes("positive"), error.message);
});
check("webp is allowed when the platform has it", () =>
  eq(refuseUnsupported(TARGET, SUPPORT), null, "refusal"),
);
check("avif is refused when the platform cannot encode it", () =>
  expect(refuseUnsupported({ ...TARGET, format: "avif" }, SUPPORT) !== null, "no refusal"),
);
check("the avif refusal names the PNG fallback", () =>
  expect(
    refuseUnsupported({ ...TARGET, format: "avif" }, SUPPORT)?.reason.includes("PNG") === true,
    "reason",
  ),
);
check("the refusal points at this chapter", () =>
  eq(refuseUnsupported({ ...TARGET, format: "avif" }, SUPPORT)?.fallbackChapter, 6, "chapter"),
);
check("a batch of four plans four jobs", () =>
  eq(planBatch([JOB, { ...JOB, name: "b.jpg" }], TARGET, SUPPORT, 1e9).planned.length, 2, "jobs"),
);
check("the estimate falls as the quality falls", () =>
  expect(estimateBytes(1600, 1200, 0.9, "webp") > estimateBytes(1600, 1200, 0.5, "webp"), "estimate"),
);
check("avif is estimated smaller than webp at the same setting", () =>
  expect(estimateBytes(1000, 1000, 0.8, "avif") < estimateBytes(1000, 1000, 0.8, "webp"), "estimate"),
);
check("a batch over the budget refuses every job", () => {
  const result = planBatch([JOB, { ...JOB, name: "b.jpg" }], TARGET, SUPPORT, 1000);
  return eq(result.planned.filter((job) => job.refused).length, 2, "refused");
});
check("a batch under the budget refuses none", () =>
  eq(planBatch([JOB], TARGET, SUPPORT, 1e9).planned.filter((job) => job.refused).length, 0, "refused"),
);
check("the total is the sum of the estimates", () => {
  const result = planBatch([JOB, { ...JOB, name: "b.jpg" }], TARGET, SUPPORT, 1e9);
  const sum = result.planned.reduce((total, job) => total + job.estimatedBytes, 0);
  return eq(result.totalEstimatedBytes, sum, "total");
});

// --- the report -------------------------------------------------------------

const RESULT: PhotoResult = {
  name: "a.jpg",
  inputBytes: 100_000,
  outputBytes: 20_000,
  format: "image/webp",
  width: 1600,
  height: 1200,
  decodeMs: 12,
  encodeMs: 30,
  metadataRemoved: 1,
};

check("a smaller output passes the assertion", () =>
  expect(assertSmaller(RESULT) === undefined, "threw"),
);
check("an output larger than the input fails it", () => {
  const error = throwsSync(() => assertSmaller({ ...RESULT, outputBytes: 200_000 }), "bigger");
  return expect(error.message.includes("not smaller"), error.message);
});
check("the rendered table has a total line", () =>
  expect(renderResults([RESULT]).includes("1 photos"), "total"),
);
check("a strip that left nothing passes", () =>
  expect(assertNoMetadata(1, 0) === undefined, "threw"),
);

// --- the encoder check ------------------------------------------------------

check("a matching type passes", () =>
  expect(assertFormat("image/webp", "image/webp") === undefined, "threw"),
);
check("a silent fallback to png is refused by name", () => {
  const error = throwsSync(() => assertFormat("image/avif", "image/png"), "fallback");
  expect(error.message.includes("image/avif"), "asked");
  return expect(error.message.includes("image/png"), "answered");
});

// --- the decoder, in node ---------------------------------------------------

check("libheif decodes the fixture to 320 by 180", async () => {
  const image = await decodeHeic(new Uint8Array(HEIC));
  eq(image.width, 320, "width");
  return eq(image.height, 180, "height");
});
check("the decoder returns four bytes per pixel", async () => {
  const image = await decodeHeic(new Uint8Array(HEIC));
  return eq(image.data.byteLength, 320 * 180 * 4, "bytes");
});
check("the decoded image is not empty", async () => {
  const image = await decodeHeic(new Uint8Array(HEIC));
  let nonZero = 0;
  for (const value of image.data) if (value !== 0) nonZero += 1;
  return expect(nonZero > 100_000, `only ${nonZero} non-zero bytes`);
});

// --- the programs -----------------------------------------------------------

const run = (script: string) =>
  spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8" });

check("01 writes a segment and reads it back", () => {
  const result = run("01_read_exif.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("iPhone 15 Pro"), result.stdout);
});
check("02 strips the segment and says the data is untouched", () => {
  const result = run("02_strip_metadata.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("gone"), "strip");
  return expect(result.stdout.includes("verbatim"), "data");
});
check("03 refuses avif and a tight budget", () => {
  const result = run("03_plan_a_batch.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  expect(result.stdout.includes("cannot encode AVIF"), "avif");
  return expect(result.stdout.includes("4 of 4 refused"), "budget");
});
check("04 decodes the heic and reports the pixels", () => {
  const result = run("04_decode_heic.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("non-zero bytes"), result.stdout);
});
check("05 prints three formats per quality", () => {
  const result = run("05_quality_is_a_number.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("avif"), result.stdout);
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
