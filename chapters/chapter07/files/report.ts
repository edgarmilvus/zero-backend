/**
 * What the chapter prints: a summary, an ASCII waveform, and two assertions.
 *
 * The waveform is not decoration. A reader who can see one second of samples as forty characters
 * understands what a peak reduction is, and a terminal is the only renderer every reader has.
 */

import { dbfs, peaks, type Peak } from "./audio.ts";

export type AudioSummary = {
  readonly name: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly seconds: number;
  readonly peakDbfs: number;
  readonly rmsDbfs: number;
  readonly loudness: number;
  readonly ungated: number;
  readonly silenceRuns: number;
};

export function renderAudio(summary: AudioSummary): string {
  const pad = 20;
  const lines = [
    `file${"".padEnd(pad - 4)}${summary.name}`,
    `sample rate         ${summary.sampleRate} Hz, ${summary.channels} channel(s)`,
    `duration            ${summary.seconds.toFixed(2)} s`,
    `peak                ${summary.peakDbfs.toFixed(2)} dBFS`,
    `rms                 ${summary.rmsDbfs.toFixed(2)} dBFS`,
    `loudness            ${summary.loudness.toFixed(2)} LUFS, ${summary.ungated.toFixed(2)} ungated`,
    `silence runs        ${summary.silenceRuns}`,
  ];
  return lines.join("\n");
}

/**
 * One line per bucket: `#` for the loudest sample, `.` for the quietest.
 *
 * The scale is fixed at -60 dBFS rather than normalised to the file, so two files printed this way
 * are comparable: a quiet recording looks quiet, which is the point of a meter.
 */
export function renderWaveform(buckets: readonly Peak[], width = 60): string {
  if (buckets.length === 0) return "";
  const floorDbfs = -60;

  return buckets
    .map((bucket) => {
      const amplitude = Math.max(Math.abs(bucket.min), Math.abs(bucket.max));
      if (amplitude <= 0) return ".";
      const level = dbfs(amplitude);
      if (level <= floorDbfs) return ".";
      const filled = Math.round(((level - floorDbfs) / -floorDbfs) * width);
      return "#".repeat(Math.max(1, Math.min(width, filled)));
    })
    .join("\n");
}

/** A peak above full scale is a defect: nothing in a decoded file may exceed 1.0. */
export function assertPeakBound(samples: Float32Array): void {
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    if (Math.abs(sample) > 1.0001) {
      throw new Error(`sample ${index} is ${sample}, outside the range a WAV can store`);
    }
  }
}

/** The range a real recording lands in: below -40 is silence, above 0 is a broken meter. */
export function assertLoudnessRange(lufs: number): void {
  if (!Number.isFinite(lufs)) return;
  if (lufs > 0 || lufs < -40) {
    throw new Error(`loudness ${lufs.toFixed(2)} LUFS is outside -40..0, so the meter is wrong`);
  }
}

export function downsampleForDisplay(samples: Float32Array, columns = 60): readonly Peak[] {
  return peaks(samples, columns);
}
