# Baseline: the-ledger

Written by `tools/record_ledger.mjs`. The page renders the ledger the build wrote from the book's
twenty claims, each pointing at a record under `runs/`.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| claims | 20 |
| verified | 20 |
| failed | none |
| chapters | 20 |

## What the record says

Every chapter of the book has a sentence and a file that proves it, and the page reads the verdicts
from the same ledger the gate reads. A chapter whose record moved would be a red row here.

## What it does not say

It does not say the sentences are the best sentences. A claim can be true and uninteresting, and no
gate catches that.
