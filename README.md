# Zero Backend — companion code

The code for *Zero Backend: Client-Side Everything in TypeScript*, one folder per chapter. Every
listing in the book is here as printed, with a harness that drives it, and a record under `runs/`
for every number the prose quotes.

## The book

<p align="center">
  <img src="images/cover.jpg" alt="Zero Backend: Client-Side Everything in TypeScript" width="360">
</p>

**A field guide to moving real workloads out of the cloud.** Twenty chapters take one workload at a
time — a video, a photo, a database, a model, a document, a share link — and run it in the page,
with a measurement that says what it cost. The book itself is not in this repository.

## The twenty chapters

Each chapter number and title links to its code in this repository.

| # | title | what the code shows |
| --- | --- | --- |
| [1](chapters/chapter01/files/) | [The Server You Are Still Paying For](chapters/chapter01/files/) | range requests, seeking, egress priced |
| [2](chapters/chapter02/files/) | [What This Browser Can Actually Do](chapters/chapter02/files/) | codec, worker, storage and GPU probes |
| [3](chapters/chapter03/files/) | [The Tab as a Filesystem and a Worker Pool](chapters/chapter03/files/) | origin private file system, quota, workers |
| [4](chapters/chapter04/files/) | [FFmpeg in the Browser](chapters/chapter04/files/) | a wasm transcode with MEMFS |
| [5](chapters/chapter05/files/) | [WebCodecs, or FFmpeg Without FFmpeg](chapters/chapter05/files/) | decode, cut and re-encode with the platform |
| [6](chapters/chapter06/files/) | [The Image Pipeline: HEIC, AVIF, and EXIF](chapters/chapter06/files/) | HEIC decoding, EXIF, cold and warm |
| [7](chapters/chapter07/files/) | [Audio: Waveforms, Loudness, and Silence](chapters/chapter07/files/) | WAV, LUFS, silence detection |
| [8](chapters/chapter08/files/) | [Two Gigabytes in a Four-Gigabyte Box](chapters/chapter08/files/) | chunked hashing and a memory ceiling |
| [9](chapters/chapter09/files/) | [SQLite and PGlite: A Real Database in the Tab](chapters/chapter09/files/) | Postgres in the page, transactions, migrations |
| [10](chapters/chapter10/files/) | [DuckDB-Wasm: Analytics on a Million Rows](chapters/chapter10/files/) | columnar scans and Parquet |
| [11](chapters/chapter11/files/) | [Embeddings on the Device: Search by Meaning](chapters/chapter11/files/) | vectors, int8 quantization, recall |
| [12](chapters/chapter12/files/) | [The Model in the Page: 23 MB, One Worker, No Jank](chapters/chapter12/files/) | weights off the main thread, frame budget |
| [13](chapters/chapter13/files/) | [Two Devices, One Document: Merge Without a Server](chapters/chapter13/files/) | a CRDT merge and its limit |
| [14](chapters/chapter14/files/) | [Permissions Without a Login: The Link Is the Key](chapters/chapter14/files/) | a signed capability in the fragment |
| [15](chapters/chapter15/files/) | [The Export Is the Product: One File That Verifies Itself](chapters/chapter15/files/) | a signed document with its own reader |
| [16](chapters/chapter16/files/) | [The App That Fits on a Floppy](chapters/chapter16/files/) | a 14 KB bundle against a budget |
| [17](chapters/chapter17/files/) | [The First Week of a Real User](chapters/chapter17/files/) | a 369-byte report that cannot leak a note |
| [18](chapters/chapter18/files/) | [The Last Engine: A Worker Pool and Its Scheduler](chapters/chapter18/files/) | a pool, backpressure, cancellation |
| [19](chapters/chapter19/files/) | [A Calendar That Syncs Two Files](chapters/chapter19/files/) | DST-safe recurrence and `.ics` |
| [20](chapters/chapter20/files/) | [Deciding What Leaves the Server](chapters/chapter20/files/) | twenty claims, one gate |

## Set it up once

You need **Node 24 or later**. Check it first, because the system one is often older:

```bash
node -v          # v24 or later
git clone https://github.com/edgarmilvus/zero-backend.git
cd zero-backend
npm ci
```

The code is TypeScript executed directly by node, in erasable syntax only: no enums, no namespaces,
no constructor parameter properties. There is no build step and no bundler. The book was measured on
Node 26.12.0.

`npm ci` installs the dependencies the later chapters import — FFmpeg compiled to WebAssembly,
PGlite, DuckDB-Wasm, libheif and `playwright-core`. A clone is about 24 MB; the install adds about
290 MB, almost all of it the four engines.

A Node older than 24 cannot strip types and fails on the first file with
`Unknown file extension ".ts"`.

## Run the suite

```bash
./run_offline.sh                  # every chapter
./run_offline.sh chapter07        # chapter 7 only
```

This is the normal run and it never touches the network. A chapter runs its harness, then its five
exercises, then a check that the static server sends the two headers the browser half needs. It
prints one line per chapter, then the totals, then `gate: green`:

```
=== chapter01 ===
...
48/48 checks passed
48/48 exercise checks passed
chapter01: 2/2 headers ok (on the document and on /client.ts)
chapter01  green

=== chapter02 ===
...
gate: green (20 chapter(s))
```

Twenty chapters take about seventy-five seconds. The script runs every chapter and exits non-zero if any
of them failed, so one red chapter does not hide the rest.

The prose checks are not in this copy, because the manuscript is not; the code is the gate here, and
it is the same code the book measured.

### One chapter, one harness

```bash
node chapters/chapter18/files/01_pool.ts                  # one demo
node chapters/chapter18/files/run_ex18.ts                 # the harness alone
node chapters/chapter18/files/exercises/run_exercises.ts  # the five exercises
npm run typecheck                                         # every chapter, types only
```

The harness is the gate; a demo only prints. `run_exNN.ts` asserts on state and is what decides
whether the chapter still does what the prose says.

## Run everything live (a real browser)

There is no model and no API key in this book. What the book calls a live run is **a real browser**:
a recorder opens the chapter's page in your Chrome, performs the workload, and writes what happened.
It is the only thing in the repository that writes to `runs/`.

```bash
node tools/record_pool.mjs chapter18
```

```
serial            220 ms, longest frame 221 ms
pooled            45 ms, longest frame 42 ms
record            runs/chapter18/worker-pool/record.json
```

A recorder overwrites its record — `record.json`, `baseline.md`, `browser.log`, `screenshot.png` and
its row in `runs/INDEX.md`. That is the point: a record is reproducible, not sacred. To restore the
committed numbers, `git checkout runs/`.

It launches Chrome through `channel: "chrome"`, so a normal Chrome installation is required;
`playwright-core` does not download one.

| chapter | recorder | writes |
| --- | --- | --- |
| 1 | `node tools/measure_browser.mjs chapter01` | `runs/chapter01/reel-120mb/` |
| 2 | `node tools/record_profile.mjs chapter02` | `runs/chapter02/capability-profile/` |
| 3 | `node tools/record_storage.mjs chapter03` | `runs/chapter03/opfs-roundtrip/` |
| 4 | `node tools/record_transcode.mjs chapter04` | `runs/chapter04/transcode-fixture/` |
| 5 | `node tools/record_clip.mjs chapter05` | `runs/chapter05/canvas-clip/` |
| 6 | `node tools/record_photo.mjs chapter06` | `runs/chapter06/image-pipeline/` |
| 7 | `node tools/record_audio.mjs chapter07` | `runs/chapter07/voice-trim/` |
| 8 | `node tools/record_stream.mjs chapter08` | `runs/chapter08/chunked-hash/` |
| 9 | `node tools/record_db.mjs chapter09` | `runs/chapter09/docs-in-a-tab/` |
| 10 | `node tools/record_analytics.mjs chapter10` | `runs/chapter10/analytics-in-a-tab/` |
| 11 | `node tools/record_vectors.mjs chapter11` | `runs/chapter11/search-by-meaning/` |
| 12 | `node tools/record_worker.mjs chapter12` | `runs/chapter12/model-in-a-worker/` |
| 13 | `node tools/record_sync.mjs chapter13` | `runs/chapter13/two-replicas/` |
| 14 | `node tools/record_capability.mjs chapter14` | `runs/chapter14/share-link/` |
| 15 | `node tools/record_export.mjs chapter15` | `runs/chapter15/one-file/` |
| 16 | `node tools/record_app.mjs chapter16` | `runs/chapter16/one-file-app/` |
| 17 | `node tools/record_support.mjs chapter17` | `runs/chapter17/support-report/` |
| 18 | `node tools/record_pool.mjs chapter18` | `runs/chapter18/worker-pool/` |
| 19 | `node tools/record_calendar.mjs chapter19` | `runs/chapter19/calendar-across-dst/` |
| 20 | `node tools/record_ledger.mjs chapter20` | `runs/chapter20/the-ledger/` |

One recorder is special. Chapter 11's model is **not** a dependency of this repository — 287 MB of
native runtime for one chapter — so its recorder asks for the package explicitly:

```bash
npm i -D @huggingface/transformers@4.3.2
node tools/record_vectors.mjs chapter11
```

The suite does not need it: the chapter's vectors are committed and the harness reads them.

## Windows and PowerShell

The TypeScript is portable; `run_offline.sh` is a POSIX shell script, so Windows has three workable
setups.

**WSL 2 (recommended).** Install Node 24 inside the Linux distribution, then work from the mounted
repository:

```bash
cd /mnt/c/Users/YOU/zero-backend
npm ci
./run_offline.sh
```

**Git Bash.** Install Git for Windows, put Node on `PATH`, open Git Bash in the repository, and run
the same commands as on macOS or Linux.

**PowerShell directly, without the `.sh` script.** The runner is a convenience around `node`; run the
harness and the exercises yourself:

```powershell
cd $HOME\zero-backend
npm ci
node chapters\chapter01\files\run_ex1.ts
node chapters\chapter01\files\exercises\run_exercises.ts
npm run typecheck
```

Every harness in the repository:

```powershell
Get-ChildItem chapters\chapter*\files\run_ex*.ts |
  ForEach-Object { node $_.FullName }
```

**Line endings.** `.gitattributes` pins LF for the scripts. If you cloned before it existed,
`run_offline.sh` fails with `bad interpreter: No such file or directory`; fix the checkout once:

```powershell
git config core.autocrlf false
git rm --cached -r .
git reset --hard
```

**Long paths.** A few chapter trees are deep. If `git clone` fails, enable long paths
(`git config --global core.longpaths true`) or clone into `C:\src\zero-backend`.

If a script reports `Permission denied` under WSL or Git Bash, make it executable once:

```bash
chmod +x run_offline.sh
```

## What is where

```text
chapters/chapterNN/
  files/                 the modules, the demos and run_exNN.ts
  files/exercises/       five exercise solutions and run_exercises.ts
  files/browser/         the page and the static server that sends COOP/COEP
  files/fixtures/        chapter-specific fixtures, where the chapter has them
  files/built/           the bundle chapter 16 and chapter 17 measure
runs/chapterNN/<id>/     record.json, baseline.md, browser.log, screenshot.png
runs/INDEX.md            every run, one row
tools/                   one recorder per chapter, plus the header check
run_offline.sh           the suite described above
capstone/                the Vite app that imports chapter 3's modules
```

Every chapter carries its own modules, harness and fixtures; the only shared things are
`node_modules` and the records under `runs/`.

## Licence

The code — listings, harnesses, exercises, tools — is MIT. See `LICENSE`. The book's text, figures
and diagrams are © 2026 Edgar Milvus, all rights reserved.

## When something does not start

| message | what it means |
| --- | --- |
| `Unknown file extension ".ts"` | The Node you are running is older than 24 and cannot strip types. Install Node 24 and check `node -v`. |
| `Cannot find package 'libheif-js'` or `ERR_MODULE_NOT_FOUND` under `node_modules` | `npm ci` was not run, or was run in another folder. Run it at the repository root. |
| `Cannot find package 'playwright-core'` | The same: a recorder needs `npm ci`. The offline suite does not. |
| `Chromium distribution 'chrome' is not found` | Recorders drive your installed Chrome. Install Chrome, or use a machine that has it. |
| `bad interpreter: No such file or directory` | `run_offline.sh` has CRLF line endings. See Windows above. |
| `permission denied: ./run_offline.sh` | `chmod +x run_offline.sh`, once. |
| a red row in `node chapters/chapter20/files/01_ledger.ts` | A record moved or went missing, so the ledger refuses to call it verified. That is the check working, not a broken checkout. |

## The ledger

Chapter 20 checks the other nineteen. Each chapter has one claim and one file that proves it:

```bash
node chapters/chapter20/files/01_ledger.ts
```

```
chapters          20
with a claim      20
verified          20
missing           none
failed            0
```

Every number the book quotes comes from one of these records. If you change a demo, run its chapter
harness: the assertions are the reason the prose can be specific, and the ledger is the reason the
prose can be checked.
