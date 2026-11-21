# Baseline: worker-pool

Written by `tools/record_pool.mjs`. The same FNV hash over six four-megabyte buffers, on the main
thread and in a pool of four workers.

Measured in Chrome Chrome 157.0.8103.79.

| | main thread | pool of four |
| --- | --- | --- |
| total | 220 ms | 45 ms |
| longest frame | 221 ms | 42 ms |

## What the record says

The pool is faster because there are four cores, and the frame survives because the work left the
thread. The second number is the chapter's: a pool is not a speed trick, it is a way to keep the
longest gap between paints under the budget.

## What it does not say

It does not say the work got cheaper. Six buffers of four megabytes are the same bytes either way;
the pool moved them off the thread that draws.
