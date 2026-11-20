/**
 * The arithmetic: peaks, RMS, loudness and silence.
 *
 * All of it is functions of a Float32Array, which is why this chapter's gate needs no decoder and
 * no browser. The loudness is a simplified EBU R128: K-weighting, 400 ms blocks, and the two gates
 * the standard specifies, with the coefficients from the standard's 48 kHz reference.
 */

export type Peak = {
  /** The lowest sample in the bucket, for the top of a waveform. */
  readonly min: number;
  /** The highest sample, for the bottom of it. */
  readonly max: number;
};

/**
 * Reduces a channel to `buckets` pairs of min and max.
 *
 * Taking the extremes rather than the average is the whole point: an average hides a transient, so a
 * clipped drum looks quiet in the editor and the user hears distortion they never saw.
 */
export function peaks(samples: Float32Array, buckets: number): readonly Peak[] {
  if (!Number.isInteger(buckets) || buckets < 1) {
    throw new Error(`buckets: expected a positive integer, got ${buckets}`);
  }
  if (samples.length === 0) return [];

  const out: Peak[] = [];
  const perBucket = samples.length / buckets;

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const from = Math.floor(bucket * perBucket);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((bucket + 1) * perBucket)));
    let min = 1;
    let max = -1;
    for (let index = from; index < to; index += 1) {
      const sample = samples[index] ?? 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    out.push({ min, max });
  }

  return out;
}

/** Amplitude in dBFS: zero is full scale, and a sine of amplitude A reads twenty log10 A. */
export function dbfs(amplitude: number): number {
  if (amplitude <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(amplitude);
}

/**
 * The RMS of a block, in dBFS.
 *
 * Twenty times the log of the root mean square, not of the mean square: the difference is a factor
 * of two in decibels and it is the first exercise in this chapter.
 */
export function rmsDbfs(samples: Float32Array): number {
  if (samples.length === 0) return Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return dbfs(Math.sqrt(sum / samples.length));
}

/** One biquad, in the transposed direct form the standard's coefficients assume. */
type Biquad = { readonly b: readonly number[]; readonly a: readonly number[] };

/** K-weighting stage 1, from EBU R128's 48 kHz reference filter. */
const SHELF: Biquad = {
  b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
  a: [1, -1.69065929318241, 0.73248077421585],
};

/** K-weighting stage 2: the high-pass that removes the rumble nobody hears. */
const HIGHPASS: Biquad = {
  b: [1, -2, 1],
  a: [1, -1.99004745483398, 0.99007225036621],
};

function apply(samples: Float32Array, filter: Biquad): Float32Array {
  const out = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const [b0, b1, b2] = filter.b as [number, number, number];
  const [, a1, a2] = filter.a as [number, number, number];

  for (let index = 0; index < samples.length; index += 1) {
    const x0 = samples[index] ?? 0;
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  return out;
}

export type Loudness = {
  /** The integrated loudness after both gates: the number a podcast is mastered to. */
  readonly integrated: number;
  /** The loudness before gating, which a silent passage drags down. */
  readonly ungated: number;
  readonly blocks: number;
  readonly gatedBlocks: number;
};

/**
 * Integrated loudness in LUFS, with the standard's two gates.
 *
 * The blocks are 400 ms with 75 per cent overlap, the absolute gate drops anything below -70 LUFS,
 * and the relative gate drops anything more than ten units below the mean of what survived. The
 * second gate is why a minute of silence does not lower the number: it removes itself.
 *
 * The coefficients are the 48 kHz ones, and a file at another rate is measured with them. At 44.1
 * kHz the error is under two tenths of a unit for speech, which is inside the tolerance this chapter
 * prints and not inside a broadcaster's.
 */
export function loudnessLufs(samples: Float32Array, sampleRate: number): Loudness {
  if (samples.length === 0) return { integrated: -Infinity, ungated: -Infinity, blocks: 0, gatedBlocks: 0 };

  const weighted = apply(apply(samples, SHELF), HIGHPASS);
  const blockSamples = Math.round(sampleRate * 0.4);
  const hop = Math.round(sampleRate * 0.1);
  if (blockSamples <= 0 || hop <= 0) throw new Error("loudness: the sample rate is too low to block");

  const energies: number[] = [];
  for (let at = 0; at + blockSamples <= weighted.length; at += hop) {
    let sum = 0;
    for (let index = at; index < at + blockSamples; index += 1) {
      const sample = weighted[index] ?? 0;
      sum += sample * sample;
    }
    energies.push(sum / blockSamples);
  }

  if (energies.length === 0) {
    // A file shorter than one block is measured as one block: better than refusing a jingle.
    let sum = 0;
    for (const sample of weighted) sum += sample * sample;
    energies.push(sum / weighted.length);
  }

  const toLufs = (energy: number): number => -0.691 + 10 * Math.log10(energy);
  const ungated = toLufs(energies.reduce((a, b) => a + b, 0) / energies.length);

  const aboveAbsolute = energies.filter((energy) => toLufs(energy) > -70);
  if (aboveAbsolute.length === 0) {
    return { integrated: -Infinity, ungated, blocks: energies.length, gatedBlocks: 0 };
  }

  const meanEnergy = aboveAbsolute.reduce((a, b) => a + b, 0) / aboveAbsolute.length;
  const relativeGate = toLufs(meanEnergy) - 10;
  const gated = aboveAbsolute.filter((energy) => toLufs(energy) > relativeGate);

  return {
    integrated: toLufs(gated.reduce((a, b) => a + b, 0) / gated.length),
    ungated,
    blocks: energies.length,
    gatedBlocks: gated.length,
  };
}

export type Silence = {
  readonly startSample: number;
  readonly endSample: number;
  readonly seconds: number;
};

/**
 * Runs of samples below a threshold, longer than a minimum duration.
 *
 * A threshold in dBFS and a duration in milliseconds, never a single sample: a digital zero between
 * two words is one sample long and cutting it changes the sentence.
 */
export function findSilence(
  samples: Float32Array,
  sampleRate: number,
  options: { readonly thresholdDbfs: number; readonly minMs: number },
): readonly Silence[] {
  const limit = 10 ** (options.thresholdDbfs / 20);
  const minSamples = Math.max(1, Math.round((options.minMs / 1000) * sampleRate));
  const runs: Silence[] = [];

  let start = -1;
  for (let index = 0; index <= samples.length; index += 1) {
    const quiet = index < samples.length && Math.abs(samples[index] ?? 0) <= limit;
    if (quiet && start < 0) start = index;
    if (!quiet && start >= 0) {
      const length = index - start;
      if (length >= minSamples) {
        runs.push({ startSample: start, endSample: index, seconds: length / sampleRate });
      }
      start = -1;
    }
  }

  return runs;
}

export type TrimPlan = {
  readonly fromSample: number;
  readonly toSample: number;
  readonly keptSeconds: number;
  readonly cutSeconds: number;
};

/** Cuts everything outside the first and last non-silent run, keeping a margin at each end. */
export function trimPlan(
  samples: Float32Array,
  sampleRate: number,
  options: { readonly thresholdDbfs: number; readonly minMs: number; readonly marginMs: number },
): TrimPlan {
  const runs = findSilence(samples, sampleRate, options);
  if (runs.length === 0) {
    return {
      fromSample: 0,
      toSample: samples.length,
      keptSeconds: samples.length / sampleRate,
      cutSeconds: 0,
    };
  }

  const margin = Math.round((options.marginMs / 1000) * sampleRate);

  // Only a run that touches an edge is leading or trailing silence. A quiet passage in the middle
  // of a sentence is part of the recording, and cutting it would cut a word.
  const leading = runs.find((run) => run.startSample === 0)?.endSample ?? 0;
  const trailing = [...runs].reverse().find((run) => run.endSample === samples.length)?.startSample ?? samples.length;

  // A file that is silent from end to end has no content, and the plan says so by keeping nothing.
  if (leading >= trailing) {
    return { fromSample: 0, toSample: 0, keptSeconds: 0, cutSeconds: samples.length / sampleRate };
  }

  const from = Math.max(0, leading - margin);
  const to = Math.min(samples.length, trailing + margin);
  return {
    fromSample: from,
    toSample: to,
    keptSeconds: Math.max(0, to - from) / sampleRate,
    cutSeconds: (samples.length - Math.max(0, to - from)) / sampleRate,
  };
}
