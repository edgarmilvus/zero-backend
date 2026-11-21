# Baseline: one-file-app

Written by `tools/record_app.mjs`. It builds the app, opens `built/app.html` from `file://`, writes
two notes and searches them.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| file | 14376 bytes |
| budget | 100000 bytes |
| modules | 3 |
| notes after the run | 2 |
| stored by the page | 0.3 kB |

## What the record says

A notes app with search, a share link and an export runs from a single HTML file opened from disk,
with no server and no network. The file is a few per cent of the budget the chapter sets.

## What it does not say

It does not say the app is complete. The export is the chapter 15 format without a permission, and
the search is a substring scan: both are stated in the chapter.
