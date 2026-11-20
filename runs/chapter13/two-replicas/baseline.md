# Baseline: two-replicas

Written by `tools/record_sync.mjs`. Two replicas are edited while apart, then exchange their whole
state once; the merge is a function with no server.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| notes after the merge | 3 |
| conflicts | 1 |
| bytes exchanged | 729 |
| merge | 0.09 ms for both directions |

## What the record says

Two devices with different edits end with the same document, and the page shows it: the same three
ids on both sides, one conflict where both wrote the same note, and a merge that costs a tenth of a
millisecond at this size.

## What it does not say

The state is three notes. A thousand notes and their tombstones are in the chapter's fourth program,
and the bytes there are the number a protocol decision needs.
