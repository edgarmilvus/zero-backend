/**
 * Example 4 - what a codec needs before it will run here.
 *
 *   node chapters/chapter05/files/04_what_it_needs.ts
 *
 * WebCodecs gives frames and not files, so every job answers three questions before it starts:
 * does the platform have this codec, does the sample need a description, and who is going to read
 * the container. The table is the chapter's decision, one line per format.
 */

export type Need = {
  readonly codec: string;
  readonly container: string;
  /** True when `VideoDecoder.configure` needs a description from the sample entry. */
  readonly description: boolean;
  /** True when the container has to be parsed before a single chunk exists. */
  readonly demuxer: boolean;
  /** What the book does when the platform does not have it. */
  readonly fallback: string;
};

export const NEEDS: readonly Need[] = [
  { codec: "avc1", container: "mp4", description: true, demuxer: true, fallback: "chapter 4: the wasm build" },
  { codec: "hvc1", container: "mp4", description: true, demuxer: true, fallback: "chapter 4, if the build has x265" },
  { codec: "vp09", container: "webm", description: false, demuxer: true, fallback: "chapter 4: libvpx" },
  { codec: "av01", container: "mp4", description: true, demuxer: true, fallback: "chapter 4, or re-encode the source" },
  { codec: "mp4a", container: "mp4", description: true, demuxer: true, fallback: "AudioDecoder, same rules" },
];

export type Verdict = "run" | "needs description" | "needs a demuxer" | "fallback";

/** Three questions in order, because the first one that fails is the one the reader must fix. */
export function verdictFor(need: Need, platformHas: boolean, haveDemuxer: boolean): Verdict {
  if (!platformHas) return "fallback";
  if (need.description) {
    // A description is only obtainable from the container, so it needs the demuxer too.
    if (!haveDemuxer) return "needs a demuxer";
    return "run";
  }
  if (need.demuxer && !haveDemuxer) return "needs a demuxer";
  return "run";
}

const HAVE = new Set(["avc1", "vp09", "mp4a"]);

export function main(): number {
  console.log(
    `${"codec".padEnd(8)}${"container".padEnd(11)}${"desc".padEnd(6)}${"demux".padEnd(7)}verdict`,
  );
  console.log(`${"-".repeat(8)}${"-".repeat(11)}${"-".repeat(6)}${"-".repeat(7)}-------`);

  for (const need of NEEDS) {
    console.log(
      `${need.codec.padEnd(8)}${need.container.padEnd(11)}` +
        `${(need.description ? "yes" : "no").padEnd(6)}${(need.demuxer ? "yes" : "no").padEnd(7)}` +
        `${verdictFor(need, HAVE.has(need.codec), true)}`,
    );
  }

  console.log("");
  console.log("with no demuxer, everything that needs a description stops:");
  for (const need of NEEDS) {
    const verdict = verdictFor(need, HAVE.has(need.codec), false);
    if (verdict !== "run") console.log(`  ${need.codec.padEnd(8)}${verdict}`);
  }
  console.log("");
  console.log("the table is the chapter's answer: the platform is fast, and it does not read containers");

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
