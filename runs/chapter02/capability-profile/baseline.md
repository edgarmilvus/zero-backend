# Baseline: capability-profile

Written by `tools/record_profile.mjs`. Both profiles come from the chapter's own
detection code: node through `01_detect_here.ts --json`, Chrome through the same
`detect.ts` served to the page. Nothing here is typed by hand.

Measured 2026-11-20T13:11:16.463Z. Chrome 157.0.8103.79 against node v26.12.0, one machine.

## Chrome, on this machine

Tier 3 of 3, with all 12 capabilities present.

## The two engines differ

```text
node v26.12.0        chrome 157

workers                    no        yes
offscreen-canvas           blocked   yes
indexeddb                  no        yes
threads                    blocked   yes
webcodecs                  no        yes
opfs                       no        yes
opfs-sync                  blocked   yes
webgpu                     no        yes
file-system-access         no        yes

9 capabilities differ
```

That table is the reason the probe takes its environment as a parameter and the
reason no chapter may assume the profile of the machine it was written on.
