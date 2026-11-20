/**
 * WAV, because it is PCM with a header and the header is the whole lesson.
 *
 * Every other format is a codec and a container; WAV is the container with nothing in it, which is
 * why it is the right fixture for a chapter about arithmetic on samples. A reader who can read this
 * header can read the `data` chunk of anything that stores PCM.
 */

export type WavFormat = {
  readonly channels: number;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
};

export type Audio = {
  /** One array per channel, samples in -1..1. */
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
};

const RIFF = 0x52494646; // "RIFF"
const WAVE = 0x57415645; // "WAVE"
const FMT = 0x666d7420; // "fmt "
const DATA = 0x64617461; // "data"

/**
 * Reads a RIFF/WAVE file's first `fmt ` and `data` chunks, and nothing else.
 *
 * Chunks are length-prefixed and can appear in any order, and a file may carry a `LIST` chunk with
 * metadata before the samples: a reader that assumes `fmt` is at offset 12 works on half the files
 * in the world and fails on the ones a person actually produced.
 */
export function readWav(bytes: Uint8Array): Audio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0, false) !== RIFF || view.getUint32(8, false) !== WAVE) {
    throw new Error("wav: not a RIFF/WAVE file");
  }

  let at = 12;
  let format: (WavFormat & { audioFormat: number }) | null = null;
  let data: { at: number; bytes: number } | null = null;

  while (at + 8 <= bytes.byteLength) {
    const id = view.getUint32(at, false);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;

    if (id === FMT) {
      format = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      } as WavFormat & { audioFormat: number };
    } else if (id === DATA) {
      data = { at: body, bytes: Math.min(size, bytes.byteLength - body) };
    }

    // Chunks are padded to an even length, and the padding is not counted in the size.
    at = body + size + (size % 2);
  }

  if (!format) throw new Error("wav: no fmt chunk, so the file does not say what its samples are");
  if (!data) throw new Error("wav: no data chunk, so there are no samples");
  if (format.audioFormat !== 1) {
    throw new Error(`wav: format ${format.audioFormat} is not PCM, and this chapter only reads PCM`);
  }
  if (format.bitsPerSample !== 16 && format.bitsPerSample !== 32) {
    throw new Error(`wav: ${format.bitsPerSample} bits per sample is not supported here`);
  }

  const channels = deinterleave(bytes, data.at, data.bytes, format);
  return { channels, sampleRate: format.sampleRate };
}

function deinterleave(
  bytes: Uint8Array,
  at: number,
  length: number,
  format: WavFormat & { audioFormat: number },
): readonly Float32Array[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bytesPerSample = format.bitsPerSample / 8;
  const frameBytes = bytesPerSample * format.channels;
  const frames = Math.floor(length / frameBytes);
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frames));

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const offset = at + frame * frameBytes + channel * bytesPerSample;
      const value =
        format.bitsPerSample === 16 ? view.getInt16(offset, true) / 32768 : view.getInt32(offset, true) / 2147483648;
      (channels[channel] as Float32Array)[frame] = value;
    }
  }

  return channels;
}

/**
 * Writes 16-bit PCM, mono or interleaved, with the two chunks a reader needs.
 *
 * The write is here so that a chapter about processing audio can hand back a file a reader can play,
 * and so that the round trip — read, process, write, read again — is a test rather than a claim.
 */
export function writeWav(audio: Audio, bitsPerSample: 16 | 32 = 16): Uint8Array {
  const channels = audio.channels.length;
  if (channels === 0) throw new Error("wav: no channels to write");
  const frames = audio.channels[0]?.length ?? 0;
  for (const channel of audio.channels) {
    if (channel.length !== frames) throw new Error("wav: every channel must have the same length");
  }

  const bytesPerSample = bitsPerSample / 8;
  const dataBytes = frames * channels * bytesPerSample;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);

  view.setUint32(0, RIFF, false);
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint32(8, WAVE, false);
  view.setUint32(12, FMT, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, DATA, false);
  view.setUint32(40, dataBytes, true);

  let at = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = (audio.channels[channel] as Float32Array)[frame] ?? 0;
      if (bitsPerSample === 16) {
        view.setInt16(at, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
        at += 2;
      } else {
        view.setInt32(at, Math.max(-2147483648, Math.min(2147483647, Math.round(sample * 2147483647))), true);
        at += 4;
      }
    }
  }

  return out;
}

export function durationSeconds(audio: Audio): number {
  const frames = audio.channels[0]?.length ?? 0;
  return frames / audio.sampleRate;
}
