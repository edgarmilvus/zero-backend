/**
 * The frame monitor's arithmetic, without a browser.
 *
 * A freeze is a gap between two timestamps, and the gap that matters is often the last one: the frames
 * stop while the thread is busy, and a monitor that only looks at recorded frames cannot see it. The
 * chapter's first instrument had that bug and this file is the correction.
 */

export type FrameStats = { readonly frames: number; readonly maxGapMs: number };

export function maxGap(stamps: readonly number[]): number {
  let worst = 0;
  for (let index = 1; index < stamps.length; index += 1) {
    worst = Math.max(worst, (stamps[index] as number) - (stamps[index - 1] as number));
  }
  return worst;
}

/** The stats for a window that begins at `start` and ends at `end`, with the frames in between. */
export function summarize(stamps: readonly number[], start: number, end: number): FrameStats {
  if (!(end >= start)) throw new Error(`window: end ${end} is before start ${start}`);
  const all = [start, ...stamps.filter((stamp) => stamp > start && stamp < end), end];
  return { frames: stamps.length, maxGapMs: maxGap(all) };
}

/** Frames per second over the window, which is the number a reader recognises. */
export function fps(stats: FrameStats, windowMs: number): number {
  if (!(windowMs > 0)) return 0;
  return (stats.frames / windowMs) * 1000;
}
