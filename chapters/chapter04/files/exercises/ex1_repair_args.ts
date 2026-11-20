/**
 * Exercise 1 - the command that overwrites its own input.
 *
 * The job writes to the same MEMFS path it read from. FFmpeg truncates the output before it
 * reads a frame, so the transcode fails on a file it just destroyed, and the job that follows
 * finds a container it cannot open. The repair is a separate name and a check that says so
 * before the encoder starts.
 */

import { assertSafeArgs, transcodeArgs } from "../commands.ts";
import { eq, expect, throws, type Check } from "./selfcheck.ts";

/** The bug, in the shape it ships: the same path in and out, built from one variable. */
export function buggyArgs(name: string): string[] {
  return ["-i", name, "-c:v", "libx264", "-crf", "28", name];
}

/** The repair: one name for the input, another for the output. */
export function fixedArgs(input: string, output: string): string[] {
  return transcodeArgs({ input, output, crf: 28 });
}

/** What the bug does to the file, as a byte count rather than a paragraph. */
export function survivesAfterTruncate(inputBytes: number, outputBytes: number): number {
  return Math.max(0, inputBytes - Math.min(inputBytes, outputBytes));
}

export const checks: readonly Check[] = [
  {
    name: "the buggy command names the same file twice",
    run: () => {
      const args = buggyArgs("reel.mp4");
      eq(args[1], "reel.mp4", "input");
      return eq(args.at(-1), "reel.mp4", "output");
    },
  },
  {
    name: "and the check refuses it",
    run: () => {
      const error = throws(() => assertSafeArgs(buggyArgs("reel.mp4")), "same path");
      return expect(error.message.includes("destroys"), error.message);
    },
  },
  {
    name: "the repaired command uses two names",
    run: () => {
      const args = fixedArgs("reel.mp4", "reel-out.mp4");
      eq(args[1], "reel.mp4", "input");
      return eq(args.at(-1), "reel-out.mp4", "output");
    },
  },
  {
    name: "and it passes the check",
    run: () => expect(assertSafeArgs(fixedArgs("a.mp4", "b.mp4")) === undefined, "threw"),
  },
  {
    name: "truncating the input loses the bytes the output needed",
    run: () => eq(survivesAfterTruncate(1000, 400), 600, "surviving bytes"),
  },
  {
    name: "an output bigger than the input leaves nothing at all",
    run: () => eq(survivesAfterTruncate(1000, 5000), 0, "surviving bytes"),
  },
  {
    name: "the repair costs one extra file in MEMFS, and that is the trade",
    run: () => {
      const files = new Map<string, number>();
      files.set("reel.mp4", 120e6);
      files.set("reel-out.mp4", 40e6);
      return eq([...files.values()].reduce((a, b) => a + b, 0), 160e6, "total");
    },
  },
  {
    name: "a case difference is a different file, and the check is exact",
    run: () =>
      expect(
        assertSafeArgs(["-i", "Reel.mp4", "reel.mp4"]) === undefined,
        "the check refused a case difference",
      ),
  },
];

export function main(): number {
  console.log(`buggy    ${buggyArgs("reel.mp4").join(" ")}`);
  console.log(`fixed    ${fixedArgs("reel.mp4", "reel-out.mp4").join(" ")}`);
  console.log("");
  console.log("one more name in MEMFS is cheaper than a job that eats its own input");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
