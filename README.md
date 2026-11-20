# Zero Backend — companion code

The code, the chapter contracts and the measurement records for
**Zero Backend: Client-Side Everything in TypeScript** by Edgar Milvus.

The book's thesis is that the cheapest, fastest and most private compute tier is the one
the user already owns. Every chapter moves one real workload off the server and pays for
the claim with a measurement. This repository is what makes that checkable: a harness per
chapter, five exercises per chapter, and a record for every number the prose prints.

## Requirements

- **Node 24 or newer.** The chapter code is TypeScript executed directly by node, in
  erasable syntax only. There is no build step, no bundler and no runner dependency.
- **Python 3** for the book's checkers under `tools/` (headings, listings, figures).
- A Chromium-based browser only for the chapters that record a browser measurement.

```bash
git clone https://github.com/edgarmilvus/zero-backend.git
cd zero-backend
npm ci          # dev dependencies: typescript and @types/node, for typecheck only
```

## The gate

One command runs every chapter that has a harness:

```bash
./run_offline.sh          # every chapter
./run_offline.sh chapter01
npm run typecheck
```

Each chapter's gate is its harness followed by its five exercises, both asserting:

```
$ node chapters/chapter01/files/run_ex1.ts
...
48/48 checks passed
$ node chapters/chapter01/files/exercises/run_exercises.ts
...
48/48 exercise checks passed
$ node tools/check_headers.mjs chapter01
chapter01: 2/2 headers ok (on the document and on the module script)
```

A chapter is finished when its gate is green and every number in its prose appears in a
record under `runs/`.

## Layout

```
chapters/chapterNN/spec.yaml       the contract a human reviews: invariant, artifacts, gates
chapters/chapterNN/files/          what the prose publishes, file for file
chapters/chapterNN/files/exercises the five exercises and their harness
chapters/chapter01/files/browser/  the page and the static server with COOP/COEP
runs/chapterNN/<id>-<name>/        record.json, baseline.md, browser.log, screenshot.png
tools/                             the header check, and the recorder that makes a record
run_offline.sh                     the gate
```

The listings in the book are generated from these files and checked byte for byte, so the
code here and the code in the book cannot drift.

## A record

A measurement record is the only thing the book accepts as evidence:

```
runs/chapter01/reel-120mb/
  record.json    machine, OS, browser and version, package versions with lockfile hash,
                 input name and sha256, wall clock, peak JS heap, output sha256
  baseline.md    the same operation on the server, priced with a source URL and the date
  browser.log    the raw console and wasm output
  screenshot.png
```

Replay one with `node chapters/chapter01/files/03_read_the_record.ts`. Every field the
ledger prints is in that file, or the ledger refuses to print.

## Producing a record

A record is made by the machine that can make it, and written by a tool, never by hand:

```bash
node tools/measure_browser.mjs chapter01
```

It generates the workload's input, runs the node baseline through the chapter's own
`05_hash_the_file.ts`, drives the page in Chrome through a real file input, takes three
runs and keeps the median, screenshots the page, and writes `record.json`, `baseline.md`,
`browser.log` and the row in `runs/INDEX.md`. If the two digests differ, or the page is
not cross-origin isolated, it fails and writes nothing.

## Licence

The code — listings, harnesses, exercises, tools — is MIT (see `LICENSE`). The book's text,
figures and diagrams are © 2026 Edgar Milvus, all rights reserved.

## The book

<https://leanpub.com/ZeroBackend>
