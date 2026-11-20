/**
 * The page: sixty frames drawn here, encoded here, decoded here.
 *
 * No container is read and no file is uploaded. `VideoEncoder` takes `VideoFrame`s from a canvas,
 * `VideoDecoder` takes the chunks back, and the numbers the record keeps are the two clocks, the
 * bytes and the keyframe count.
 */

import { plannedChunks } from "../frames.ts";

export type ClipResult = {
  readonly codec: string;
  readonly frames: number;
  readonly keyframes: number;
  readonly keyEvery: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly encodeMs: number;
  readonly decodeMs: number;
  readonly mediaMs: number;
  readonly decodedFrames: number;
};

export const WIDTH = 320;
export const HEIGHT = 180;
export const FPS = 30;
export const FRAMES = 60;
export const KEY_EVERY = 12;
export const CODEC = "vp8";

type EncodedChunk = { type: "key" | "delta"; timestamp: number; duration: number; data: Uint8Array };

/** Draws one frame of a moving pattern, so two frames are never identical. */
function draw(canvas: OffscreenCanvas, index: number): void {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas: no 2d context");

  context.fillStyle = "#14213a";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  for (let bar = 0; bar < 8; bar += 1) {
    const phase = (index / FRAMES) * Math.PI * 2 + bar * 0.7;
    const height = 30 + Math.abs(Math.sin(phase)) * 120;
    context.fillStyle = bar % 2 === 0 ? "#e8833a" : "#cfe3d4";
    context.fillRect(bar * 40 + 4, HEIGHT - height, 32, height);
  }

  context.fillStyle = "#f1ede3";
  context.font = "14px monospace";
  context.fillText(`frame ${index}`, 12, 22);
}

/** Whether this browser can encode this codec at these dimensions. */
export async function supported(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const { supported: ok } = await VideoEncoder.isConfigSupported({
      codec: CODEC,
      width: WIDTH,
      height: HEIGHT,
      bitrate: 1_000_000,
      framerate: FPS,
    });
    return ok === true;
  } catch {
    return false;
  }
}

/** The whole job: sixty frames out of a canvas, through the encoder, back through the decoder. */
export async function encodeClip(): Promise<ClipResult> {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    throw new Error("WebCodecs: this browser has no VideoEncoder or VideoDecoder");
  }
  if (!(await supported())) {
    throw new Error(`WebCodecs: this browser cannot encode ${CODEC} at ${WIDTH}x${HEIGHT}`);
  }

  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const chunks: EncodedChunk[] = [];
  const plan = plannedChunks(FRAMES, FPS, KEY_EVERY);

  let encoded = 0;
  let keyframes = 0;
  const encodeStarted = performance.now();

  await new Promise<void>((resolve, reject) => {
    const encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push({
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration ?? 0,
          data,
        });
        if (chunk.type === "key") keyframes += 1;
        encoded += 1;
        if (encoded === FRAMES) resolve();
      },
      error: (error) => reject(error),
    });

    encoder.configure({
      codec: CODEC,
      width: WIDTH,
      height: HEIGHT,
      bitrate: 1_000_000,
      framerate: FPS,
    });

    for (let index = 0; index < FRAMES; index += 1) {
      draw(canvas, index);
      const frame = new VideoFrame(canvas, {
        timestamp: plan[index]?.timestampUs ?? Math.round((index * 1e6) / FPS),
        duration: plan[index]?.durationUs ?? Math.round(1e6 / FPS),
      });
      // A keyframe exactly where the plan says, so the seek arithmetic is the real one.
      encoder.encode(frame, { keyFrame: index % KEY_EVERY === 0 });
      frame.close();
    }

    void encoder.flush().then(() => {
      if (encoded < FRAMES) reject(new Error(`encoder produced ${encoded} of ${FRAMES} frames`));
    });
  });

  const encodeMs = performance.now() - encodeStarted;
  const bytes = chunks.reduce((sum, chunk) => sum + chunk.data.byteLength, 0);

  // The decoder is fed the same chunks, in timestamp order, and must give back the same count.
  let decodedFrames = 0;
  const decodeStarted = performance.now();

  await new Promise<void>((resolve, reject) => {
    const decoder = new VideoDecoder({
      output: () => {
        decodedFrames += 1;
        if (decodedFrames === chunks.length) resolve();
      },
      error: (error) => reject(error),
    });

    decoder.configure({ codec: CODEC, codedWidth: WIDTH, codedHeight: HEIGHT });

    for (const chunk of chunks) {
      decoder.decode(
        new EncodedVideoChunk({
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration,
          data: chunk.data,
        }),
      );
    }

    void decoder.flush().then(() => {
      if (decodedFrames < chunks.length) {
        reject(new Error(`decoder produced ${decodedFrames} of ${chunks.length} frames`));
      }
    });
  });

  const decodeMs = performance.now() - decodeStarted;

  return {
    codec: CODEC,
    frames: FRAMES,
    keyframes,
    keyEvery: KEY_EVERY,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    bytes,
    encodeMs,
    decodeMs,
    mediaMs: Math.round((FRAMES / FPS) * 1000),
    decodedFrames,
  };
}

declare global {
  interface Window {
    __clip: () => Promise<ClipResult>;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const button = document.querySelector<HTMLButtonElement>("#run");

  const run = async (): Promise<void> => {
    if (status) status.textContent = "encoding 60 frames...";
    try {
      const result = await encodeClip();
      if (status) {
        status.textContent = `${result.frames} frames in ${result.encodeMs.toFixed(0)} ms, ${
          result.bytes
        } bytes, ${result.keyframes} keyframes`;
      }
      if (output) {
        output.textContent = [
          `codec            ${result.codec} ${result.width}x${result.height}`,
          `frames           ${result.frames} at ${result.fps} fps (${result.mediaMs} ms)`,
          `keyframes        ${result.keyframes}, every ${result.keyEvery} frames`,
          `bytes            ${result.bytes}`,
          `encode           ${result.encodeMs.toFixed(1)} ms`,
          `decode           ${result.decodeMs.toFixed(1)} ms`,
          `decoded          ${result.decodedFrames} of ${result.frames}`,
          `speed            ${(result.mediaMs / result.encodeMs).toFixed(1)}x real time, encode only`,
        ].join("\n");
      }
    } catch (error) {
      if (status) status.textContent = `failed: ${(error as Error).message}`;
    }
  };

  // The recorder drives the same entry point a reader drives, and each call runs the whole job.
  window.__clip = encodeClip;
  button?.addEventListener("click", () => void run());
}
