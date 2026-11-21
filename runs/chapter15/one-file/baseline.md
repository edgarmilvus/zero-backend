# Baseline: one-file

Written by `tools/record_export.mjs`. The page builds a single HTML file with the notes, a
capability from chapter 14 and the reader inline, then opens it in a sandboxed frame.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| notes | 12 |
| file | 6.0 kB |
| sealed | Notes, verified: sealed 2026-11-21T11:46:14.632Z, 12 note(s), permission valid until 2026-11-21T12:46:14.632Z |
| one note edited after the seal | Not verified: the notes were changed after the file was sealed |
| expired permission | Not verified: the permission in this file expired at 2026-11-21T10:47:14.886Z |
| reader | 156 ms to its verdict |

## What the record says

The file that is opened is the file that decides: the frame renders the notes only when the digest
covers them and the permission verifies and has not expired. Editing one note and rebuilding the
same file changes the verdict to a refusal, and so does minting the permission in the past.

## What it does not say

It does not say the file is safe to open from a stranger. The reader is inside it, so a hostile
export can carry a hostile reader; the signature on the notes is not a signature on the code.
