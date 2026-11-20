# Baseline: analytics-in-a-tab

Written by `tools/record_analytics.mjs`. The node half runs the same WebAssembly the page does,
through DuckDB's blocking build; the browser half clicks the page's button and reads the result.

Measured on Chrome Chrome 157.0.8103.79, DuckDB v1.5.4.

| | value |
| --- | --- |
| rows | 1,000,000 |
| wasm, eh bundle | 34.3 MB |
| browser cold start | 726 ms |
| parquet fetch | 9 ms |
| first scan | 68 ms |
| warm scan | 29 ms |
| node: generate a million rows | 110 ms |
| node: group by | 41 ms |
| node: parquet | 2.3 MB |
| node: csv | 22.2 MB |
| javascript baseline | 83 ms build, 26 ms group, 146 MB rss |

## What the record says

A million rows is not where JavaScript loses: the baseline's group by is in the same range as the
engine's. What the engine buys is the file: the same rows are a 2.3 MB Parquet against a 23 MB
CSV, and a query scans the file without building an object per row.

## What it does not say

The rows are synthetic and the machine has the file in the page cache after the fetch. A phone's
first scan is slower, and the chapter's exercise 3 is the arithmetic for a budget that is not this
laptop's.
