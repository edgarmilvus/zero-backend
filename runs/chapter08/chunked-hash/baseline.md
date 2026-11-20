# Baseline: chunked-hash

Written by `tools/record_stream.mjs`. The page hashed a real file through `File.slice`, one chunk
at a time, with an accumulator of its own: `SubtleCrypto.digest` takes a whole buffer, and the
whole buffer is what this chapter cannot afford.

Measured in Chrome Chrome 157.0.8103.79 over `/tmp/rand256.bin`.

| | whole file | chunked |
| --- | --- | --- |
| memory held | 268435456 bytes plus the copy | 67108864 bytes per read |
| reads | 1 | 4 |
| wall clock | not measured: the tab cannot hold it | 140 ms |
| throughput | — | 1915 MB/s |

## What the record says

A 0.27 GB file read in 4 slices of at most 67 MB, at 1915 MB/s, and every one of its 268435456 bytes passed through the loop. The accumulator counts
bytes because `SubtleCrypto.digest` is not streaming; the node half uses SHA-256, which is.

## What it does not say

The browser cannot report its own peak memory the way the node run does, so the memory column is
the plan's arithmetic rather than a measurement. The node record is where the real RSS lives.
