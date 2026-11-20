# Baseline: transcode-fixture

Written by `tools/record_transcode.mjs`. The browser half is the chapter's own page; the
native half is the same argument vector run against the same file, on the same machine,
ten seconds later (ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers).

| | Chrome, 32 MB of wasm | native ffmpeg |
| --- | --- | --- |
| output | 24,051 bytes | 23,932 bytes |
| wall clock | 75 ms | 81 ms |
| speed | 27.0x real time | 24.9x real time |
| startup | 0.14 s for 32.2 MB | a binary already installed |

## What the record says

The transcode ran in the tab: 34,267 bytes in, 24,051 out, 1.42x smaller. Nothing left the device, so the fourth column of the ledger is zero.

The browser build is slower than native by 1.1x on this two-second clip, and that factor is the honest one for a wasm build without threads. The output is within 119 bytes of the native file, which is what "the same encoder, compiled differently" means.

## What it does not say

The clip is two seconds long, so the startup cost dominates: the core download is larger
than the job. Chapter 1's ledger is the instrument for the case where it does not.
