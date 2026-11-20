# Baseline: canvas-clip

Written by `tools/record_clip.mjs`. The clip is drawn, encoded and decoded in the page:
there is no file to demux and no server in the path.

Measured 2026-11-20T14:29:08.973Z. Chrome Chrome 157.0.8103.79, 320x180.

| | value |
| --- | --- |
| codec | vp8 |
| frames | 60 at 30 fps |
| keyframes | 5, every 12 |
| bytes | 58165 |
| encode, warm | 161.4 ms (12.4x real time) |
| encode, first run | 178.0 ms: the compiler was cold |
| decode | 11.8 ms |
| startup | 0 bytes of WebAssembly: the codec is the platform's |

## What the record says

Encoder and decoder shipped with the browser. Nothing was downloaded, nothing was
installed, and the fourth column of the ledger is zero for the same reason it was in
chapter 4: the bytes never left the tab.

## What it does not say

The frames came from a canvas, not from a file. Reading them out of an MP4 needs the
demuxer this chapter only sketches, which is why `05_compare_decoders.ts` compares this
run with chapter 4's only on the two things that are comparable: media duration and
frame count.
