# Baseline: model-in-a-worker

Written by `tools/record_worker.mjs`. The page loads the weights from the install's cache, in a
worker and then on the main thread, and embeds one sentence with the worker.

Measured in Chrome Chrome 157.0.8103.79, Xenova/all-MiniLM-L6-v2 (q8, 384 dimensions).

| | value |
| --- | --- |
| weights | 22.6 MB |
| worker load | 862 ms |
| worker longest frame | 17 ms over 54 frames |
| main thread load | 481 ms |
| main thread longest frame | 215 ms over 19 frames |
| embedding, first | 118 ms |
| embedding, warm | 24 ms |
| search, 40 notes | 1.30 ms |

## What the record says

The same model, the same machine, two threads. The worker is slower to be ready and the page keeps
painting: its longest frame is 17 ms. On the main thread the model is ready -381 ms sooner and the page stops for 215 ms, which is a freeze a person sees.

## What it does not say

The weights were in the browser's cache for both loads, and the machine is a laptop. On a cold phone
the download is the dominant cost, and the chapter's exercise 3 is that arithmetic.
