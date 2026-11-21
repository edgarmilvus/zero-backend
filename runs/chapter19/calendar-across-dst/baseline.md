# Baseline: calendar-across-dst

Written by `tools/record_calendar.mjs`. A weekly 09:00 standup and one flight in Europe/Rome, over
the change on 29 March 2026.

Measured in Chrome Chrome 157.0.8103.79.

| | value |
| --- | --- |
| occurrences in the window | 5 |
| at 09:00 on the wall | 4 |
| before the change (08:00Z) | 1 |
| after the change (07:00Z) | 3 |
| .ics bytes | 511 |

## What the record says

Every occurrence is at 09:00 on the wall, and the instants are not all the same: the ones after
29 March are an hour earlier in UTC. The appointment did not move; the planet did.

## What it does not say

It does not say every zone is as simple as Europe/Rome. A zone with a half-hour change, or one that
skips a day, is a rule the runtime carries and this record does not exercise.
