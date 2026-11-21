# Baseline: support-report

Written by `tools/record_support.mjs`. The page builds a report from diagnostics, with one note's
words given to the redactor as secrets.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| report | 369 bytes |
| category | import-failed |
| leaked | false |
| checksum | 2adb18d28e421a8d64f40cce... |

## What the record says

The report carries a build, an environment, two counts and a redacted message, and nothing that came
out of a note. The page asserts it before it offers the file, and the record reads that assertion.

## What it does not say

It does not say the redactor is complete. A short word from a body can survive if it is also English;
the design keeps note text out of the report's fields and scrubs the one free-text field.
