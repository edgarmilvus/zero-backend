# Baseline: image-pipeline

Written by `tools/record_photo.mjs`. Both pictures are the same frame, one encoded as HEIC by
macOS and one as JPEG by ffmpeg, and both go through the same four steps.

Measured 2026-11-20T14:54:50.770Z. Chrome Chrome 157.0.8103.79.

| | cover.heic | cover.jpg |
| --- | --- | --- |
| input | 6190 bytes | 8426 bytes (one APP1 injected) |
| decode, warm | 9.4 ms, 9 MB of wasm | 0.9 ms, the platform's |
| decode, first run | 47.4 ms, the module's instantiation | 3.8 ms |
| output | 4436 bytes, 320x180 | 4604 bytes, 180x320 |
| encode | 4.2 ms | 3.9 ms |
| metadata removed | 0 | 1 |

## What the record says

The platform decodes the JPEG in 0.9 ms and the HEIC takes 9.4 ms plus nine megabytes of WebAssembly: that factor of 10 is the price of a codec browsers do not ship.

AVIF encoding is not available in this build, which is why the plan refuses it instead of asking and hoping.

The JPEG came out 180x320: the injected Orientation 6 was honoured by `createImageBitmap`, so the pipeline drew a portrait picture from a landscape file. The HEIC, with no EXIF, stayed landscape.

## What it does not say

The two inputs are a 6 kB HEIC and an 8 kB JPEG of a synthetic frame, not two 4 MB photos from
a phone. The ratios hold approximately; the milliseconds do not scale linearly, and the chapter
says so where it prints them.
