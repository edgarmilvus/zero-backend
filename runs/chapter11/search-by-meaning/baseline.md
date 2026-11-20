# Baseline: search-by-meaning

Written by `tools/record_vectors.mjs`. The vectors are the model's output, committed as
`chapters/chapter11/files/embeddings.json`; the page searches them without running the model.

Measured in Chrome Chrome 157.0.8103.79, Xenova/all-MiniLM-L6-v2 (q8, 384 dimensions).

| | value |
| --- | --- |
| model, cached | 23 MB |
| load, cached | 319 ms |
| embedded | 48 texts in 123 ms |
| fixture | 157 kB |
| semantic, top five | 70 per cent of the right subject |
| keyword, top five | 38 per cent |
| int8 recall | 100 per cent |
| int8 size | 15 kB against 60 kB |
| page search | 12.0 ms |

## What the record says

Meaning finds 70 per cent of the right subject where words find 38, on eight questions the corpus was written to answer. The margin is a
property of these forty notes and these eight phrasings, and the harness refuses it below twenty points.

int8 keeps every note of the exact top five, at a quarter of the bytes, and that is a measurement over
this corpus rather than a promise about every one.

## What it does not say

The model was already cached: the first run downloads 23 MB and takes seconds. The page does not run
the model at all, which is the chapter's split and not an oversight.
