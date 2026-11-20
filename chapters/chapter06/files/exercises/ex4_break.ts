/**
 * Exercise 4 - the format the browser answers with a PNG.
 *
 * `convertToBlob({ type: "image/avif" })` resolves. The blob's type is `image/png`. No error, no
 * warning, and a pipeline that trusts its own request writes four hundred PNGs into a folder whose
 * files say `.avif`.
 *
 * The repair is one comparison: the type you got against the type you asked for.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Encoder = (format: string) => Promise<{ type: string; size: number }>;

/** A platform that encodes webp and jpeg, and answers everything else with a png. */
export const PLAIN: Encoder = async (format) => ({
  type: format === "image/webp" || format === "image/jpeg" ? format : "image/png",
  size: format === "image/webp" ? 12_000 : 18_000,
});

export type Result = { readonly asked: string; readonly got: string; readonly bytes: number; readonly ok: boolean };

/** The bug: take the blob and ship it. */
export async function trustTheRequest(encode: Encoder, format: string): Promise<Result> {
  const blob = await encode(format);
  return { asked: format, got: blob.type, bytes: blob.size, ok: true };
}

/** The repair: compare, and refuse a result that is not the requested type. */
export async function checkTheResult(encode: Encoder, format: string): Promise<Result> {
  const blob = await encode(format);
  const ok = blob.type === format;
  if (!ok) {
    throw new Error(
      `encode: asked for ${format} and the browser answered ${blob.type}, so the file is not what its name says`,
    );
  }
  return { asked: format, got: blob.type, bytes: blob.size, ok };
}

export const checks: readonly Check[] = [
  {
    name: "webp comes back as webp",
    run: async () => eq((await checkTheResult(PLAIN, "image/webp")).got, "image/webp", "type"),
  },
  {
    name: "avif comes back as png from the trusted path",
    run: async () => eq((await trustTheRequest(PLAIN, "image/avif")).got, "image/png", "type"),
  },
  {
    name: "and the trusted path calls it a success",
    run: async () => eq((await trustTheRequest(PLAIN, "image/avif")).ok, true, "ok"),
  },
  {
    name: "the repaired path refuses it",
    run: async () => {
      try {
        await checkTheResult(PLAIN, "image/avif");
        throw new Error("accepted");
      } catch (error) {
        return expect((error as Error).message.includes("answered"), (error as Error).message);
      }
    },
  },
  {
    name: "the refusal names both types",
    run: async () => {
      try {
        await checkTheResult(PLAIN, "image/avif");
        return false;
      } catch (error) {
        const message = (error as Error).message;
        expect(message.includes("image/avif"), "asked");
        return expect(message.includes("image/png"), "answered");
      }
    },
  },
  {
    name: "jpeg comes back as jpeg",
    run: async () => eq((await checkTheResult(PLAIN, "image/jpeg")).got, "image/jpeg", "type"),
  },
  {
    name: "the png the platform produced is larger than the webp it would have",
    run: async () => {
      const png = await trustTheRequest(PLAIN, "image/avif");
      const webp = await checkTheResult(PLAIN, "image/webp");
      return expect(png.bytes > webp.bytes, `${png.bytes} vs ${webp.bytes}`);
    },
  },
  {
    name: "a format the platform does not know is also a png",
    run: async () => eq((await trustTheRequest(PLAIN, "image/heic")).got, "image/png", "type"),
  },
  {
    name: "the check is the only thing between the request and the file name",
    run: async () => {
      const results = await Promise.allSettled([
        checkTheResult(PLAIN, "image/webp"),
        checkTheResult(PLAIN, "image/avif"),
      ]);
      eq(results[0]?.status, "fulfilled", "webp");
      return eq(results[1]?.status, "rejected", "avif");
    },
  },
];

export function main(): Promise<number> {
  return (async () => {
    for (const format of ["image/webp", "image/jpeg", "image/avif"]) {
      const trusted = await trustTheRequest(PLAIN, format);
      console.log(
        `${format.padEnd(12)} asked ${trusted.asked.padEnd(12)} got ${trusted.got.padEnd(12)} ${trusted.bytes} bytes`,
      );
    }
    console.log("");
    console.log("the third line is the file that ships with a .avif extension and a PNG inside");
    return 0;
  })();
}

if (import.meta.main) {
  process.exit(await main());
}
