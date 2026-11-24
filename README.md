# Zero Backend — companion code

The code for *Zero Backend: Scale the Product, Not the Cloud Bill*, one folder per chapter.

The book's argument is simple to state and hard to prove: a browser can do most of the work a server
is paid for. Each chapter takes one real job — play a large video, convert a photo, query a database,
search notes by meaning, merge two copies of a document — and does it inside the page. To keep itself
honest, each chapter also ships a **harness** (a small program that runs the chapter's code and fails
when the result is wrong) and a **record** (a folder under `runs/` holding what the run measured). The
numbers in the book are read from those records, not typed from memory.

This repository is the code, not the book. The prose, the figures, the chapter contracts and the EPUB
are not here; what is here is everything a reader can run and check.

## The book

<p align="center">
  <img src="images/cover.jpg" alt="Zero Backend: Scale the Product, Not the Cloud Bill" width="360">
</p>

**A field guide to moving real workloads out of the cloud.** Twenty chapters, one workload each: a
video that is decoded without being downloaded, a photo converted on the phone, a gigabyte hashed in
a bounded amount of memory, a database and a language model running in a tab, a document that merges
without a server, a permission carried in a link, an app small enough for a floppy disk. Every chapter
prices the move with a measurement and states what the move cannot do.

[Additional information →](https://tiny.cc/ZeroBackend)

## The twenty chapters

Each chapter number and title links to its code in this repository. The third column says, in plain
words, what that code demonstrates.

| # | title | what the code shows |
| --- | --- | --- |
| [1](chapters/chapter01/files/) | [The Server You Are Still Paying For](chapters/chapter01/files/) | fetching only the byte ranges a player needs instead of the whole file, and pricing the bytes a server would have sent |
| [2](chapters/chapter02/files/) | [What This Browser Can Actually Do](chapters/chapter02/files/) | asking the browser which video codecs, background threads, storage and graphics APIs it supports, before writing the feature |
| [3](chapters/chapter03/files/) | [The Tab as a Filesystem and a Worker Pool](chapters/chapter03/files/) | writing a real file into the origin private file system (a folder a page can use without a file picker), and moving work to a worker thread |
| [4](chapters/chapter04/files/) | [FFmpeg in the Browser](chapters/chapter04/files/) | running FFmpeg, a video tool, compiled to WebAssembly, inside the page, with the file in an in-memory disk |
| [5](chapters/chapter05/files/) | [WebCodecs, or FFmpeg Without FFmpeg](chapters/chapter05/files/) | cutting and re-encoding a clip with WebCodecs, the browser's own codec interface |
| [6](chapters/chapter06/files/) | [The Image Pipeline: HEIC, AVIF, and EXIF](chapters/chapter06/files/) | converting an iPhone photo (HEIC) in the page, reading its EXIF metadata, and timing a cold and a warm run |
| [7](chapters/chapter07/files/) | [Audio: Waveforms, Loudness, and Silence](chapters/chapter07/files/) | reading a WAV file, measuring loudness against a target, and finding silence |
| [8](chapters/chapter08/files/) | [Two Gigabytes in a Four-Gigabyte Box](chapters/chapter08/files/) | hashing a gigabyte in fixed-size chunks, and measuring the memory the process holds (its RSS) |
| [9](chapters/chapter09/files/) | [SQLite and PGlite: A Real Database in the Tab](chapters/chapter09/files/) | running Postgres, a SQL database, in the page with real transactions and migrations |
| [10](chapters/chapter10/files/) | [DuckDB-Wasm: Analytics on a Million Rows](chapters/chapter10/files/) | grouping a million rows with DuckDB in the page, and reading a Parquet file, a columnar format built for scans |
| [11](chapters/chapter11/files/) | [Embeddings on the Device: Search by Meaning](chapters/chapter11/files/) | turning notes into vectors (lists of numbers that encode meaning), compressing each number to one byte, and measuring how many right results survive |
| [12](chapters/chapter12/files/) | [The Model in the Page: 23 MB, One Worker, No Jank](chapters/chapter12/files/) | loading a small language model in a worker thread while the page keeps painting, measured as the longest gap between frames |
| [13](chapters/chapter13/files/) | [Two Devices, One Document: Merge Without a Server](chapters/chapter13/files/) | merging two edited copies of a document with a CRDT, a data type whose merge always converges, and naming the case it cannot resolve |
| [14](chapters/chapter14/files/) | [Permissions Without a Login: The Link Is the Key](chapters/chapter14/files/) | signing a permission into the fragment of a URL (the part after `#`, which browsers never send to a server) |
| [15](chapters/chapter15/files/) | [The Export Is the Product: One File That Verifies Itself](chapters/chapter15/files/) | exporting one HTML file that carries its notes, its permission and the reader that checks them |
| [16](chapters/chapter16/files/) | [The App That Fits on a Floppy](chapters/chapter16/files/) | bundling the whole app into one 14 KB file and checking it against a size budget |
| [17](chapters/chapter17/files/) | [The First Week of a Real User](chapters/chapter17/files/) | building a support report from named fields only, so no note text can escape, and triaging it into an action |
| [18](chapters/chapter18/files/) | [The Last Engine: A Worker Pool and Its Scheduler](chapters/chapter18/files/) | a pool of four worker threads taking jobs, slowing the producer when the queue fills, and cancelling work |
| [19](chapters/chapter19/files/) | [A Calendar That Syncs Two Files](chapters/chapter19/files/) | a recurring event that stays at 09:00 across daylight saving, exported as `.ics`, the file format calendars exchange |
| [20](chapters/chapter20/files/) | [Deciding What Leaves the Server](chapters/chapter20/files/) | twenty claims checked against the records that back them |

## Set it up once

You need **Node 24 or later**. Node is the program that runs JavaScript outside the browser, and from version 24 it also runs
TypeScript directly by stripping the type annotations, so the code in this repository needs no
compiler and no build step. Check the version first, because the one already
on your machine is often older:

```bash
node -v          # v24 or later
git clone https://github.com/edgarmilvus/zero-backend.git
cd zero-backend
npm ci
```

`npm ci` installs the exact package versions the lockfile pins. There are only a few, and each one is
there because a chapter is about it: FFmpeg compiled to WebAssembly (video), PGlite (Postgres in the
page), DuckDB-Wasm (analytics), libheif (HEIC photos) and `playwright-core` (driving Chrome). A clone
is about 24 MB; the install adds about 290 MB, almost all of it the four engines.

The code is TypeScript in **erasable syntax only**: no enums, no namespaces, no constructor parameter
properties. That is the subset Node can run by removing types, without translating anything.

A Node older than 24 cannot do that, and fails on the first file with `Unknown file extension ".ts"`.

## Run the suite

```bash
./run_offline.sh                  # every chapter
./run_offline.sh chapter07        # chapter 7 only
```

A chapter's gate is three checks, run in order:

1. **The harness** (`run_exNN.ts`): it calls the chapter's own modules and asserts on their results.
   An assertion is a statement the program checks and refuses to continue past when it is false.
   The harness exits non-zero on the first failure, which is how a script or a CI job knows.
2. **The exercises** (`files/exercises/run_exercises.ts`): five smaller defects with their own checks,
   so the reader can test what they understood.
3. **The headers**: the chapter's page is served by a small Node script, and the check confirms that
   the server sends the two response headers the browser half needs. They are COOP and COEP, which
   isolate the page so that `SharedArrayBuffer` — the shared memory FFmpeg's threads use — becomes
   available. Without them the page loads and the engine does not start.

The script runs every chapter, so one red chapter does not hide the rest, and exits non-zero if any
of them failed. This is the normal run: it touches no network and reads no key. On the machine the
book was measured on, the twenty chapters take about seventy-five seconds.

Output looks like this, one block per chapter:

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

The first line is the harness's own count of assertions; the second is the exercises'; the third is
the header check. `green` is the chapter's verdict. The prose checks the book runs on its own
manuscript are absent here, because the manuscript is not in this copy: the code is what a clone has,
and it is the same code the book measured.

### One chapter, one file

```bash
node chapters/chapter18/files/01_pool.ts                  # a demo: runs the code and prints what happens
node chapters/chapter18/files/run_ex18.ts                 # the harness: asserts, and exits non-zero on failure
node chapters/chapter18/files/exercises/run_exercises.ts  # the five exercises
npm run typecheck                                         # asks the compiler whether the types agree
```

A demo only prints. The harness is the gate: it is the program that decides whether the chapter still
does what the prose says. `npm run typecheck` is a separate, weaker check — it catches type errors,
not wrong numbers.

## Run everything live (a real browser)

There is no model and no API key in this book. What the book calls a live run is **a real browser**:
a **recorder** — a Node script under `tools/` — opens the chapter's page in Chrome, performs the
workload, and writes what happened. It is the only thing in the repository that writes to `runs/`.

```bash
node tools/record_pool.mjs chapter18
```

```
serial            220 ms, longest frame 221 ms
pooled            45 ms, longest frame 42 ms
record            runs/chapter18/worker-pool/record.json
```

That run compares the same hashing job done two ways: on the page's main thread, and in a pool of four
worker threads. `longest frame` is the longest gap between two paints; 100 ms is the point where a
page stops feeling responsive, so the second pair of numbers is the argument.

A recorder overwrites its record: `record.json` (the numbers, the machine, the versions),
`baseline.md` (the same numbers in a table, with what the run does not prove), `browser.log` (the
page's console output and errors), `screenshot.png` (the page at the end) and its row in
`runs/INDEX.md`. That is the point of a record: it is reproducible, not sacred. To put the committed
numbers back, run `git checkout runs/`.

The recorder asks Playwright to launch **your installed Chrome** (the `channel: "chrome"` option).
`playwright-core` is a library for driving a browser, not a browser: it downloads nothing, so Chrome
has to be installed already.

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

Chapter 8 needs a 1 GB file. Its recorder creates `/tmp/zero1g.bin` as a sparse file when it is not
there, and takes another path as its second argument:
`node tools/record_stream.mjs chapter08 /path/to/file`.

One recorder is special. Chapter 11 needs a real embedding model, which is **not** a dependency of
this repository — 287 MB of native runtime for one chapter — so its recorder asks for the package
explicitly:

```bash
npm i -D @huggingface/transformers@4.3.2
node tools/record_vectors.mjs chapter11
```

The suite does not need it: the vectors that model produced are committed, and the harness reads them.

## Windows and PowerShell

The TypeScript is portable. `run_offline.sh` is a POSIX shell script, the kind macOS and Linux run, so
Windows needs one of three setups.

**WSL 2 (recommended).** WSL is a small Linux system running inside Windows. Install Node 24 inside
it, then work from the mounted repository:

```bash
cd /mnt/c/Users/YOU/zero-backend
npm ci
./run_offline.sh
```

**Git Bash.** Install Git for Windows, put Node on `PATH`, open Git Bash in the repository, and run
the same commands as on macOS or Linux.

**PowerShell directly, without the `.sh` script.** The runner is only a convenience around `node`;
run the harness and the exercises yourself:

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

**Line endings.** Windows uses two characters to end a line, Unix uses one. If a `.sh` file arrives
with the Windows pair, the shell cannot read its first line and answers
`bad interpreter: No such file or directory`. `.gitattributes` in this repository tells git to keep
LF, the one-character ending, for the scripts. If you cloned before that file existed, fix the
checkout once:

```powershell
git config core.autocrlf false
git rm --cached -r .
git reset --hard
```

**Long paths.** A few chapter trees are deep, and Windows limits how long a path may be. If `git clone`
fails, enable long paths (`git config --global core.longpaths true`) or clone into `C:\src\zero-backend`.

If a script reports `Permission denied` under WSL or Git Bash, mark it executable once:

```bash
chmod +x run_offline.sh
```

## What is where

```text
chapters/chapterNN/
  files/                 the chapter's modules, its demos (01_*.ts …), and run_exNN.ts, the harness
  files/exercises/       five exercise solutions and run_exercises.ts, which checks them
  files/browser/         the page, its client script, and serve.mjs, the static server that sends COOP/COEP
  files/fixtures/        small inputs the chapter reads, where the chapter has them
  files/built/           the bundle chapters 16 and 17 build and then measure
runs/chapterNN/<name>/    one measured run: record.json, baseline.md, browser.log, screenshot.png
runs/INDEX.md            every run, one row, with the chapter and the path of its record
tools/                   one recorder per chapter, plus the header check
run_offline.sh           the suite described above
capstone/                the Vite app the reader builds at the end, importing chapter 3's modules
```

Every chapter carries its own modules, harness and inputs. The only shared things are `node_modules`
(the installed packages) and the records under `runs/`.

## The words this repository uses

| word | what it means here |
| --- | --- |
| **harness** | a program that runs the chapter's code and asserts on the result; it fails loudly when the result is wrong |
| **demo** | a program that runs the code and prints what happens, with no verdict |
| **record** | the folder under `runs/` written by one measured run: the numbers, the machine, the versions, the log, the screenshot |
| **recorder** | the Node script that opens a page in Chrome, performs the workload, and writes a record |
| **gate** | the command that runs a chapter's harness, exercises and header check and reports green or failed |
| **claim** | one sentence the book makes, plus the record that backs it, and a floor when the sentence is about a number |
| **floor** | the value a measured number must reach for the claim to hold; a floor rather than an equal sign, so a new run does not break a true sentence |

## Licence

The code — listings, harnesses, exercises, tools — is MIT. See `LICENSE`. The book's text, figures
and diagrams are © 2026 Edgar Milvus, all rights reserved.

## When something does not start

Each message below is what the program actually prints, and what it means.

| message | what it means |
| --- | --- |
| `Unknown file extension ".ts"` | The Node you are running is older than 24 and cannot strip types. Install Node 24 and check `node -v`. |
| `Cannot find package 'libheif-js'` or `ERR_MODULE_NOT_FOUND` under `node_modules` | `npm ci` was not run, or was run in another folder. Run it at the repository root. |
| `Cannot find package 'playwright-core'` | The same: a recorder needs `npm ci`. The offline suite does not. |
| `Chromium distribution 'chrome' is not found` | Recorders drive your installed Chrome. Install Chrome, or use a machine that has it. |
| `bad interpreter: No such file or directory` | `run_offline.sh` has Windows line endings. See Windows above. |
| `permission denied: ./run_offline.sh` | The file is not marked executable. `chmod +x run_offline.sh`, once. |
| a red row in `node chapters/chapter20/files/01_ledger.ts` | A record moved or went missing, so the check refuses to call it verified. That is the gate working, not a broken checkout. |

## The evidence

Every chapter makes one statement about something it measured — that a file written by a page
survives a reload, that a pool of four keeps the frame under budget — and the run that produced the
number was saved as a JSON file under `runs/`. That pair is what the book calls a claim: a sentence,
and the file that backs it. In `chapters/chapter20/files/claims.ts` the third entry is

```ts
{ id: "c03", chapter: 3,
  statement: "A file in the origin private file system survives a reload",
  evidence: "runs/chapter03/opfs-roundtrip/record.json" }
```

`statement` is the sentence the chapter prints; `evidence` is the record the run wrote. When the
sentence is about a number, the entry gains two fields: `field`, the dotted path of that number
inside the record (`worker.loadMs`, `node.parquetBytes`), and `min`, the floor the number has to
reach. A floor and not an equal sign, because a new run changes the record: the claim should survive
a faster laptop, and fail only when the number drops below the line the argument needs.

Chapter 20, *Deciding What Leaves the Server*, walks the twenty claims, opens each record, checks
that the record was written by the chapter that names it, and compares the field with its floor:

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

Each line answers a different question. `chapters` is how many chapters the book has. `with a claim`
is how many of them make a statement at all. `verified` is how many statements their records confirm.
`missing` names the chapters that made no statement, and `failed` names the statements a record
contradicts. Read together, the five say the book agrees with its own files and nothing is quietly
absent.

If a record moves, its row goes red and `missing` or `failed` stops being empty — that is the check
working, not a broken checkout. If you change a demo, run its chapter harness: the assertions are
the reason the prose can be specific, and these twenty records are the reason the prose can be
checked.
