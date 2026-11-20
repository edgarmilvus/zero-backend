# Baseline: opfs-roundtrip

Written by `tools/record_storage.mjs`. The browser half is the chapter's own page; the
node half is `04_opfs_roundtrip.ts`, which runs the same port against memory.

Measured 2026-11-20T19:48:43.453Z. Chrome Chrome 157.0.8103.79.

| | chrome, OPFS | node, memory |
| --- | --- | --- |
| store | opfs | memory (no OPFS in node) |
| files after eight writes | 8 | 4 (the example's own) |
| bytes | 524288 | 2,097,152 |
| files after the reload | 8 of 8 from the queue, plus the sync probe | not applicable: a process has no reload |
| peak jobs in flight | 4 | 4 by construction |

## What the reload proved

The page wrote eight files, was reloaded, and listed them before writing anything:
**8 of the eight queue files and 525312 bytes** were still there.
A memory store would have listed zero, because a reload destroys the heap.

## Node, the same port

```text
store            memory (this runtime has no OPFS)

four 512 kB writes               2097152 bytes        0.1 ms  21408.7 MB/s

file                               bytes  modified
----------------------------------------  --------
chunk-0.bin                       524288  19:48:43
chunk-1.bin                       524288  19:48:43
chunk-2.bin                       524288  19:48:43
chunk-3.bin                       524288  19:48:43

  4 files, 2,097,152 bytes

read back        524288 bytes, first byte 7 (true)
run this in the browser page of this chapter to see the same four files survive a reload
```

The same five operations, the same inventory shape, a different store. That is what the
port buys, and it is why this chapter's gate runs in node at all.
