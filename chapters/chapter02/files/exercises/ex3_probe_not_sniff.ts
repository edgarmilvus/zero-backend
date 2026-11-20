/**
 * Exercise 3 - the probe that sniffs instead of probing.
 *
 * `sniff` reads the user-agent string and decides. It is wrong in both directions: it
 * freezes a browser to what it was on the day the table was written, and it believes a
 * string that any user can change and any tool can fake.
 *
 * The repair is not a better table. It is to stop asking the name and start touching the
 * thing, which is what `detectCapabilities` already does.
 */

import { detectCapabilities } from "../detect.ts";
import { probe, type Capabilities } from "../probe.ts";
import { eq, expect, type Check } from "./selfcheck.ts";

/** The bug, in the shape it really ships: a table of names and a substring test. */
const KNOWN = [
  { match: "Chrome/", threads: true, webcodecs: true, webgpu: true },
  { match: "Firefox/", threads: true, webcodecs: true, webgpu: false },
  { match: "Safari/", threads: false, webcodecs: false, webgpu: false },
] as const;

export function sniff(userAgent: string): Partial<Capabilities["present"]> {
  const row = KNOWN.find((entry) => userAgent.includes(entry.match));
  if (!row) return {};
  return row.match === "Safari/"
    ? { workers: true, wasm: true }
    : { workers: true, wasm: true, webcodecs: row.webcodecs, webgpu: row.webgpu };
}

/** A Safari that has the feature, which the table cannot know. */
export const SAFARI_18 = {
  Worker: function Worker() {},
  WebAssembly: { validate: () => true, compileStreaming: () => {} },
  VideoDecoder: function VideoDecoder() {},
  VideoEncoder: function VideoEncoder() {},
  OffscreenCanvas: function OffscreenCanvas() {},
  CompressionStream: function CompressionStream() {},
  indexedDB: {},
};

/** A Chrome that has none of it, wearing the string. */
export const SPOOFED = { navigator: { userAgent: "Mozilla/5.0 Chrome/157.0" } };

export const checks: readonly Check[] = [
  {
    name: "the sniffer says Safari has no WebCodecs",
    run: () => eq(sniff("Mozilla/5.0 Version/18.0 Safari/605.1.15").webcodecs, undefined, "sniffed"),
  },
  {
    name: "the same Safari, probed, has WebCodecs",
    run: () => eq(detectCapabilities(SAFARI_18).present.webcodecs, true, "probed"),
  },
  {
    name: "so the sniffer and the probe disagree on the same browser",
    run: () => {
      const sniffed = sniff("Mozilla/5.0 Version/18.0 Safari/605.1.15");
      const probed = detectCapabilities(SAFARI_18);
      return expect(sniffed.webcodecs !== probed.present.webcodecs, "they agreed by accident");
    },
  },
  {
    name: "the sniffer believes a spoofed Chrome",
    run: () => eq(sniff("Mozilla/5.0 Chrome/157.0").webgpu, true, "sniffed"),
  },
  {
    name: "the probe finds nothing in the same environment",
    run: () =>
      expect(
        Object.values(detectCapabilities(SPOOFED).present).every((value) => value === false),
        "the probe believed the string",
      ),
  },
  {
    name: "a browser the table has never heard of gets no answer",
    run: () => eq(Object.keys(sniff("Mozilla/5.0 Servo/0.1")).length, 0, "unknown browser"),
  },
  {
    name: "the probe answers for that browser from its features",
    run: () =>
      eq(detectCapabilities({ WebAssembly: { validate: () => true } }).present.wasm, true, "wasm"),
  },
  {
    name: "the repaired path reaches a tier the sniffer cannot see",
    run: () => {
      const caps = detectCapabilities(SAFARI_18);
      return expect(probe(caps).tier >= 1, `tier ${probe(caps).tier}`);
    },
  },
  {
    name: "the repair keeps the isolation answer, which no string carries",
    run: () => {
      const caps = detectCapabilities({ ...SAFARI_18, crossOriginIsolated: true, SharedArrayBuffer: function SharedArrayBuffer() {} });
      const threads = probe(caps).reports.find((r) => r.id === "threads");
      return eq(threads?.verdict, "present", "threads");
    },
  },
  {
    name: "nothing in the repaired path reads the user agent",
    run: () => {
      const caps = detectCapabilities({ navigator: { userAgent: "anything at all" } });
      return expect(
        Object.values(caps.present).every((value) => value === false),
        "the probe consulted the string",
      );
    },
  },
];

export function main(): number {
  const ua = "Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15";
  console.log(`sniffer says   ${JSON.stringify(sniff(ua))}`);
  console.log(`probe says     ${JSON.stringify(detectCapabilities(SAFARI_18).present)}`);
  console.log("");
  console.log("the name is a label; the features are the machine");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
