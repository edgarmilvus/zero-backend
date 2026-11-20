# Baseline: reel-120mb

Written by `tools/measure_browser.mjs`. Every number below is read from a record or
printed by the chapter's own program; nothing in this file is typed by hand.

Measured 2026-11-20T11:12:23.271Z.

| | node | browser |
| --- | --- | --- |
| engine | node v26.12.0 | Chrome 157.0.8103.79 |
| machine | Apple M1 | Apple M1 |
| os | darwin 24.3.0 | darwin 24.3.0 |
| input | generated:120MB (120000000 bytes) | generated:120MB (120000000 bytes) |
| sha256 | ec611fec0a1291a101bf0d2b50dbdffe812534c67c5208c1c9e39d816fbeee15 | ec611fec0a1291a101bf0d2b50dbdffe812534c67c5208c1c9e39d816fbeee15 |
| wall clock | 116.4 ms | 127.4 ms |
| peak heap | 120000000 bytes | 120000000 bytes |

The two digests are equal, which is the only thing that makes the two wall clocks
comparable: both engines hashed the same bytes.

## The server path, priced

```text
tariff        aws-us-east-1-2026-11
read on       2026-11-20
workload      reel-120mb
             one 120 MB phone reel: thumbnail, duration, checksum

requests      <$0.000001  0.0%
compute        $0.000067  0.5%
egress           $0.0108  79.3%
storage        $0.002760  20.3%
-----------------------------------------
per job          $0.0136
per 1,000         $13.63

server     $13.63    62.1 s   120.0 MB  |  4 GB address space per worker; single-threaded decode on iOS below 17; no ffmpeg filters that need a second pass
```

The tariff is data in `chapters/chapter01/files/tariff.ts`, with its source URL and
the date it was read. Client cost is 0.00 USD and 0 bytes leave the device, because
the operation happened in the tab.
