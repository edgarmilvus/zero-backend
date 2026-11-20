# Baseline: docs-in-a-tab

Written by `tools/record_db.mjs`. The page opens the same store the node half does, with one
difference: `dataDir` is `idb://`, which is PGlite's browser persistence.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| server | PostgreSQL 18.7 |
| schema version | 3 |
| first open, 26 MB of wasm | 1647 ms |
| second open | 247 ms |
| rows after the first open | 1000 |
| rows after the reload | 1000 |
| search | 16.2 ms for 11 matches |

## What the record says

The first query pays for the engine: 26 MB of WebAssembly, about 1.7 seconds, and then Postgres
is Postgres. The reload is the interesting half: the page reopened the database from IndexedDB and
found 1000 rows without inserting any, which is the difference between a heap and a store.

## What it does not say

The rows are synthetic notes, not a user's archive, and the machine is a laptop with the wasm in
the page cache. A phone's first open is longer, and the chapter's exercise 3 is the arithmetic.
