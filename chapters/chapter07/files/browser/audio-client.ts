/**
 * The page: read a WAV, meter it, draw it, trim it.
 *
 * No `AudioContext` and no decoder: the file is PCM and the arithmetic is the chapter's own modules.
 * That is the point of the page — a waveform and a loudness meter are functions, not browser features.
 */

import { readWav, writeWav, durationSeconds } from "../wav.ts";
import { dbfs, findSilence, loudnessLufs, peaks, rmsDbfs, trimPlan } from "../audio.ts";

export type PageAudio = {
  readonly sampleRate: number;
  readonly seconds: number;
  readonly peakDbfs: number;
  readonly rmsDbfs: number;
  readonly loudness: number;
  readonly ungated: number;
  readonly silenceRuns: number;
  readonly keptSeconds: number;
  readonly cutSeconds: number;
  readonly trimmedBytes: number;
  readonly originalBytes: number;
};

const OPTIONS = { thresholdDbfs: -50, minMs: 200, marginMs: 100 };

function draw(canvas: HTMLCanvasElement, samples: Float32Array): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const reduced = peaks(samples, width);

  context.fillStyle = "#14213a";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#cfe3d4";

  reduced.forEach((bucket, index) => {
    const top = ((1 - bucket.max) / 2) * height;
    const bottom = ((1 - bucket.min) / 2) * height;
    context.fillRect(index, top, 1, Math.max(1, bottom - top));
  });
}

export async function runAudio(): Promise<PageAudio> {
  const response = await fetch("/fixtures/voice.wav");
  if (!response.ok) throw new Error(`fixture: ${response.status}`);
  const original = new Uint8Array(await response.arrayBuffer());

  const audio = readWav(original);
  const channel = audio.channels[0];
  if (!channel) throw new Error("the fixture has no channel");

  let peak = 0;
  for (const sample of channel) peak = Math.max(peak, Math.abs(sample));

  const tone = channel.subarray(
    Math.round(1.2 * audio.sampleRate),
    Math.round(1.8 * audio.sampleRate),
  );
  const loudness = loudnessLufs(channel, audio.sampleRate);
  const silence = findSilence(channel, audio.sampleRate, OPTIONS);
  const plan = trimPlan(channel, audio.sampleRate, OPTIONS);

  const trimmed = writeWav({
    channels: [channel.slice(plan.fromSample, plan.toSample)],
    sampleRate: audio.sampleRate,
  });

  const canvas = document.querySelector<HTMLCanvasElement>("#wave");
  if (canvas) draw(canvas, channel);

  return {
    sampleRate: audio.sampleRate,
    seconds: durationSeconds(audio),
    peakDbfs: dbfs(peak),
    rmsDbfs: rmsDbfs(tone),
    loudness: loudness.integrated,
    ungated: loudness.ungated,
    silenceRuns: silence.length,
    keptSeconds: plan.keptSeconds,
    cutSeconds: plan.cutSeconds,
    trimmedBytes: trimmed.byteLength,
    originalBytes: original.byteLength,
  };
}

declare global {
  interface Window {
    __audio: () => Promise<PageAudio>;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const button = document.querySelector<HTMLButtonElement>("#run");

  window.__audio = runAudio;
  button?.addEventListener("click", () => {
    void runAudio().then((result) => {
      if (status) status.textContent = `${result.seconds.toFixed(2)} s read, ${result.cutSeconds.toFixed(2)} s cut`;
      if (output) {
        output.textContent = [
          `rate             ${result.sampleRate} Hz`,
          `duration         ${result.seconds.toFixed(2)} s`,
          `peak             ${result.peakDbfs.toFixed(2)} dBFS`,
          `rms              ${result.rmsDbfs.toFixed(2)} dBFS`,
          `loudness         ${result.loudness.toFixed(2)} LUFS (${result.ungated.toFixed(2)} ungated)`,
          `silence runs     ${result.silenceRuns}`,
          `kept             ${result.keptSeconds.toFixed(2)} s, cut ${result.cutSeconds.toFixed(2)} s`,
          `trimmed file     ${result.trimmedBytes} bytes from ${result.originalBytes}`,
        ].join("\n");
      }
    });
  });
}
