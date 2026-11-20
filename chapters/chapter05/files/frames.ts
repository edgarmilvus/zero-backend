/**
 * Two clocks and a plan.
 *
 * A container counts in its own timescale; WebCodecs counts in microseconds. Converting between
 * them is one multiplication and one division, and getting it wrong shifts every frame by a
 * thousand without producing a single error.
 */

/** Container units to microseconds, rounded to the nearest one. */
export function usFromTimescale(units: number, timescale: number): number {
  if (!Number.isFinite(timescale) || timescale <= 0) {
    throw new Error(`timescale: expected a positive number, got ${timescale}`);
  }
  return Math.round((units * 1e6) / timescale);
}

/** Microseconds back to container units, which is what a muxer needs. */
export function unitsFromUs(us: number, timescale: number): number {
  if (!Number.isFinite(timescale) || timescale <= 0) {
    throw new Error(`timescale: expected a positive number, got ${timescale}`);
  }
  return Math.round((us * timescale) / 1e6);
}

export type Chunk = {
  readonly timestampUs: number;
  readonly durationUs: number;
  /** A keyframe is a chunk a decoder can start from. Everything else needs what came before. */
  readonly key: boolean;
};

/** Timestamps for `count` frames at a frame rate, starting at zero. */
export function frameTimes(count: number, fps: number): readonly number[] {
  if (!Number.isInteger(count) || count < 0) throw new Error(`count: expected an integer, got ${count}`);
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`fps: expected a positive number, got ${fps}`);
  const step = 1e6 / fps;
  return Array.from({ length: count }, (_, index) => Math.round(index * step));
}

/**
 * The chunk plan an encoder is given, and the shape a seek depends on.
 *
 * `keyEvery` is a decision with two costs. A short interval makes seeking cheap and the file
 * bigger, because a keyframe carries no reference to its neighbours; a long interval does the
 * reverse. Twelve frames is half a second at 24 fps, which is the number a scrub bar wants.
 */
export function plannedChunks(frameCount: number, fps: number, keyEvery: number): readonly Chunk[] {
  if (!Number.isInteger(keyEvery) || keyEvery < 1) {
    throw new Error(`keyEvery: expected a positive integer, got ${keyEvery}`);
  }
  const times = frameTimes(frameCount, fps);
  const step = Math.round(1e6 / fps);

  return times.map((timestampUs, index) => ({
    timestampUs,
    durationUs: step,
    key: index % keyEvery === 0,
  }));
}

/**
 * What a seek to `targetUs` costs: how many frames a decoder must process first.
 *
 * The answer is the distance from the previous keyframe, which is why the plan matters. A decoder
 * cannot start in the middle of a group of pictures, so a seek to the last frame of a twelve-frame
 * group costs eleven frames of work.
 */
export function seekCost(
  chunks: readonly Chunk[],
  targetUs: number,
): { readonly framesToProcess: number; readonly keyIndex: number } {
  if (chunks.length === 0) throw new Error("seek: no chunks to seek in");

  let keyIndex = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) break;
    if (chunk.key && chunk.timestampUs <= targetUs) keyIndex = index;
  }

  let framesToProcess = 0;
  for (let index = keyIndex; index < chunks.length; index += 1) {
    framesToProcess += 1;
    const chunk = chunks[index];
    if (!chunk || chunk.timestampUs >= targetUs) break;
  }

  return { framesToProcess, keyIndex };
}
