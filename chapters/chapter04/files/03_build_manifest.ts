/**
 * Example 3 - joining three segments without re-encoding them.
 *
 *   node chapters/chapter04/files/03_build_manifest.ts
 *
 * A recorder produces chunks, and a chunk is not a file the user wants. The concat demuxer joins
 * them with `-c copy`, which takes milliseconds instead of re-encoding everything, and the price
 * is that every segment must already share a codec, a resolution and a time base.
 */

import { concatArgs } from "./commands.ts";
import { manifestText, VirtualFiles, assertManifestName } from "./vfs.ts";
import { formatBytes } from "./report.ts";

const SEGMENTS = ["chunk-0.mp4", "chunk-1.mp4", "chunk-2.mp4"];

export function main(): number {
  const files = new VirtualFiles(64 * 1e6);
  for (const [index, name] of SEGMENTS.entries()) {
    files.write(name, new Uint8Array(1024 * (index + 1)));
  }

  const manifest = manifestText(SEGMENTS);
  files.write("list.txt", new TextEncoder().encode(manifest));

  const args = concatArgs({ manifest: "list.txt", output: "merged.mp4" });

  console.log("MEMFS now holds:");
  for (const entry of files.list()) {
    console.log(`  ${entry.name.padEnd(16)} ${formatBytes(entry.bytes)}`);
  }
  console.log("");
  console.log("list.txt:");
  console.log(manifest.trimEnd().split("\n").map((line) => `  ${line}`).join("\n"));
  console.log("");
  console.log(`ffmpeg ${args.join(" ")}`);
  console.log("");
  console.log(`total            ${formatBytes(files.usedBytes())}`);
  console.log("`-c copy` is the whole point: no decoder, no encoder, one demuxer");

  const refused = ["chunk 0.mp4"];
  try {
    assertManifestName(refused[0] ?? "");
    console.log("a name with a space was accepted, which is the bug");
  } catch (error) {
    console.log(`and a name with a space: ${(error as Error).message}`);
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
