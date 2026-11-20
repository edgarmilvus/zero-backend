| id | chapter | engine | input | wall clock | peak heap | measured | record |
| --- | --- | --- | --- | --- | --- | --- | --- |
| reel-120mb | 1 | chrome | generated:120MB | 0.127 s | 120000000 | 2026-11-20 | [reel-120mb](./chapter01/reel-120mb/record.json) |
| reel-120mb | 1 | node | generated:120MB | 0.116 s | 120000000 | 2026-11-20 | [reel-120mb](./chapter01/reel-120mb-node/record.json) |
| capability-profile | 2 | chrome | capability probe | tier 3 | 12 capabilities | 2026-11-20 | [capability-profile](./chapter02/capability-profile/profile.json) |
| opfs-roundtrip | 3 | chrome | eight 64 kB files | peak 4 in flight | 524288 bytes | 2026-11-20 | [opfs-roundtrip](./chapter03/opfs-roundtrip/record.json) |
| transcode-fixture | 4 | chrome | sample.mp4 34 kB | 122 ms | 24051 bytes out | 2026-11-20 | [transcode-fixture](./chapter04/transcode-fixture/record.json) |
| canvas-clip | 5 | chrome | 60 canvas frames | 193 ms encode | 58165 bytes | 2026-11-20 | [canvas-clip](./chapter05/canvas-clip/record.json) |
| image-pipeline | 6 | chrome | heic 6 kB + jpeg 8 kB | decode 15 / 1 ms | 4436 bytes out | 2026-11-20 | [image-pipeline](./chapter06/image-pipeline/record.json) |
| voice-trim | 7 | chrome | voice.wav 258 kB | -10.83 LUFS | 1.80 s cut | 2026-11-20 | [voice-trim](./chapter07/voice-trim/record.json) |
| chunked-hash | 8 | chrome | 0.27 GB | 140 ms | 67 MB per read | 2026-11-20 | [chunked-hash](./chapter08/chunked-hash/record.json) |
