/**
 * Example 4 - the decoder no browser ships.
 *
 *   node chapters/chapter06/files/04_decode_heic.ts
 *
 * HEIC is HEVC in a box and the patent situation keeps it off every browser except the ones on
 * Apple's platforms. libheif-js is 9 MB of WebAssembly and it is the first column of this chapter
 * that is not zero. It runs in node too, which is why the gate can test it.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeHeic } from "./heic.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export function main(): Promise<number> {
  return (async () => {
    const heic = new Uint8Array(readFileSync(join(HERE, "fixtures", "cover.heic")));
    const jpeg = new Uint8Array(readFileSync(join(HERE, "fixtures", "cover.jpg")));

    const image = await decodeHeic(heic);

    console.log(`heic             ${heic.byteLength} bytes`);
    console.log(`jpeg             ${jpeg.byteLength} bytes, same picture, same 320x180`);
    console.log("");
    console.log(`decoded          ${image.width}x${image.height}, ${image.data.byteLength} bytes of RGBA`);
    console.log(`decode           ${image.decodeMs.toFixed(1)} ms, including the wasm's first instantiation`);
    console.log("");

    let nonZero = 0;
    for (const value of image.data) if (value !== 0) nonZero += 1;
    console.log(`non-zero bytes   ${nonZero} of ${image.data.byteLength}`);
    console.log("");
    console.log("the same file is 6 kB here and 8 kB as a JPEG: container and codec, not quality");

    const again = await decodeHeic(heic);
    console.log(`second decode    ${again.decodeMs.toFixed(1)} ms, the module is warm`);
    return 0;
  })();
}

if (import.meta.main) {
  process.exit(await main());
}
