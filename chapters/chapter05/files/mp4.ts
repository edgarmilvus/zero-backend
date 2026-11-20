/**
 * The four facts WebCodecs needs from the container, and the tree they live in.
 *
 * A decoder needs a codec string, a description, a resolution and a timescale. All four are in
 * the file's boxes, and the path to them never changes: `moov`, a `trak`, its `mdia`, the media
 * header, the handler that says whether the track is video, and the sample description that
 * carries the codec and its `avcC`.
 */

import { BoxReader, find, payload, readBoxes, type Box } from "./boxes.ts";

export type Track = {
  readonly handler: "vide" | "soun" | string;
  /** The four-character code of the sample entry: `avc1`, `hvc1`, `vp09`, `mp4a`. */
  readonly sampleEntry: string;
  /** The string WebCodecs wants: `avc1.64001e`, `mp4a.40.2`. */
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  readonly timescale: number;
  readonly durationUnits: number;
  /** The `avcC` or equivalent, which a decoder needs before the first chunk. */
  readonly description: Uint8Array;
};

export type Mp4Summary = {
  readonly brand: string;
  readonly movieTimescale: number;
  readonly tracks: readonly Track[];
};

const VIDEO_ENTRIES = new Set(["avc1", "avc3", "hvc1", "hev1", "vp08", "vp09", "av01"]);
const AUDIO_ENTRIES = new Set(["mp4a", "opus", "ac-3"]);

/**
 * Reads the file once and returns what a decoder configuration is made of.
 *
 * The boxes are read from the bytes in memory rather than streamed, because the summary is four
 * numbers and a description: a media pipeline would stream, and this chapter is not one.
 */
export function readMp4(bytes: Uint8Array): Mp4Summary {
  const boxes = readBoxes(bytes);
  const reader = new BoxReader(bytes);

  const ftyp = find(boxes, "ftyp");
  const brand = ftyp ? reader.type(ftyp.start + ftyp.headerBytes) : "";

  const moov = find(boxes, "moov");
  if (!moov) throw new Error("mp4: no moov box, so this is not a file a browser can play");

  const mvhd = find(boxes, "moov/mvhd");
  if (!mvhd) throw new Error("mp4: no mvhd, so the movie has no timescale");

  // mvhd: version(1) flags(3), then creation and modification time, then the timescale.
  const mvhdVersion = reader.u8(mvhd.start + mvhd.headerBytes);
  const movieTimescale = reader.u32(mvhd.start + mvhd.headerBytes + (mvhdVersion === 1 ? 20 : 12));

  const tracks: Track[] = [];
  for (const entry of walkTracks(boxes)) {
    const track = readTrack(bytes, entry);
    if (track) tracks.push(track);
  }

  return { brand, movieTimescale, tracks };
}

/** The `trak` boxes directly under `moov`, in file order. */
function walkTracks(boxes: readonly Box[]): readonly Box[] {
  const moov = boxes.find((box) => box.type === "moov");
  return moov ? moov.children.filter((box) => box.type === "trak") : [];
}

function readTrack(bytes: Uint8Array, trak: Box): Track | null {
  const reader = new BoxReader(bytes);
  const mdia = trak.children.find((box) => box.type === "mdia");
  if (!mdia) return null;

  const hdlr = mdia.children.find((box) => box.type === "hdlr");
  const handler = hdlr ? reader.type(hdlr.start + hdlr.headerBytes + 8) : "";

  const mdhd = mdia.children.find((box) => box.type === "mdhd");
  if (!mdhd) return null;
  const version = reader.u8(mdhd.start + mdhd.headerBytes);
  const timescale = reader.u32(mdhd.start + mdhd.headerBytes + (version === 1 ? 20 : 12));
  const durationUnits = reader.u32(mdhd.start + mdhd.headerBytes + (version === 1 ? 24 : 16));

  // minf/stbl/stsd, then the first sample entry. Its four bytes of type are the codec's name.
  const stsd = find([mdia], "mdia/minf/stbl/stsd");
  if (!stsd) return null;

  // stsd payload: version(1) flags(3) entry_count(4), then the entries. Each entry is itself a
  // box: size, four-character type, then the codec's own fields.
  const entryStart = stsd.start + stsd.headerBytes + 8;
  const entryBytes = reader.u32(entryStart);
  const sampleEntry = reader.type(entryStart + 4);
  const entryEnd = Math.min(entryStart + entryBytes, stsd.start + stsd.bytes);

  // A VisualSampleEntry puts width and height 32 bytes in; an AudioSampleEntry has no sizes.
  const video = VIDEO_ENTRIES.has(sampleEntry);
  const width = video ? reader.u16(entryStart + 32) : 0;
  const height = video ? reader.u16(entryStart + 34) : 0;

  const description = readDescription(bytes, entryStart + (video ? 86 : 36), entryEnd, sampleEntry);
  const codec = codecString(sampleEntry, description, reader, entryStart, entryEnd);

  return {
    handler,
    sampleEntry,
    codec,
    width,
    height,
    timescale,
    durationUnits,
    description,
  };
}

/**
 * The `avcC` (or `hvcC`) box inside a sample entry, as bytes.
 *
 * It is the sequence parameter set and the picture parameter set: without it an `avc1` decoder
 * has no idea what the stream looks like, and `configure` fails with a message about a
 * description rather than about the file.
 */
function readDescription(bytes: Uint8Array, from: number, to: number, entry: string): Uint8Array {
  if (!VIDEO_ENTRIES.has(entry) && !AUDIO_ENTRIES.has(entry)) return new Uint8Array(0);
  const inner = readBoxes(bytes, from, to);
  const wanted = ["avcC", "hvcC", "vpcC", "av1C", "esds"];
  const match = inner.find((box) => wanted.includes(box.type));
  return match ? payload(bytes, match) : new Uint8Array(0);
}

/**
 * The string `VideoDecoder.configure` wants.
 *
 * For H.264 it is the sample entry plus the profile, the constraint flags and the level, all
 * three of which are in the first four bytes of the `avcC`. The string is not decoration: an
 * `avc1` with a level the platform does not decode fails at configure, and the level is the last
 * byte of that word.
 */
export function codecString(
  sampleEntry: string,
  description: Uint8Array,
  reader: BoxReader,
  entryStart: number,
  entryEnd: number,
): string {
  if (sampleEntry === "avc1" || sampleEntry === "avc3") {
    if (description.byteLength < 4) return sampleEntry;
    const profile = description[1] ?? 0;
    const constraints = description[2] ?? 0;
    const level = description[3] ?? 0;
    const hex = (value: number): string => value.toString(16).padStart(2, "0");
    return `${sampleEntry}.${hex(profile)}${hex(constraints)}${hex(level)}`;
  }

  if (sampleEntry === "hvc1" || sampleEntry === "hev1") {
    return `${sampleEntry}.${(description[1] ?? 0).toString(16)}.4.L93.B0`;
  }

  if (sampleEntry === "vp09" || sampleEntry === "av01") {
    void reader;
    void entryStart;
    void entryEnd;
    return sampleEntry;
  }

  return sampleEntry;
}

export function descriptionBytes(track: Track): Uint8Array {
  if (track.description.byteLength === 0) {
    throw new Error(`track ${track.codec}: no description, so a decoder cannot be configured`);
  }
  return track.description;
}
