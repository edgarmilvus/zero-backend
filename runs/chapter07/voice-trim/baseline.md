# Baseline: voice-trim

Written by `tools/record_audio.mjs`. The page reads PCM with the chapter's own header parser and
meters it with the chapter's own functions: no decoder, no AudioContext, no server.

Measured 2026-11-20T15:06:42.183Z. Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| sample rate | 44100 Hz |
| duration | 3.00 s |
| peak | -6.02 dBFS |
| rms of the tone | -9.03 dBFS |
| loudness | -10.83 LUFS, -14.00 ungated |
| silence runs | 2 |
| kept / cut | 1.20 s / 1.80 s |
| trimmed file | 105882 bytes from 264678 |

## What the record says

The tone is at half amplitude, so the peak is -6.02 dBFS and the RMS is -9.03: a sine reads three
decibels under its peak, which is the arithmetic the first exercise is about.

Gated and ungated loudness differ by 3.17 units because a third of
the file is silence. The gate is what stops that silence from lowering the number.

## What it does not say

The file is three seconds of a synthetic tone, not a podcast. The meters are correct for it and the
chapter prints the tolerance a reader should expect from a simplified R128 implementation.
