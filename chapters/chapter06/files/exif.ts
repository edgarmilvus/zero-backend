/**
 * EXIF: a TIFF directory bolted to a JPEG, and the segment chain that carries it.
 *
 * The parser is a hundred lines because the format is one: a JPEG is a chain of length-prefixed
 * segments, the metadata is one of them, and that segment contains a TIFF header, a directory, and
 * offsets whose base is the header rather than the file.
 */

export type Segment = {
  readonly marker: number;
  /** Offset of the marker's 0xFF in the file. */
  readonly at: number;
  readonly headerBytes: number;
  /** Length of the payload, excluding the two length bytes. */
  readonly payloadBytes: number;
};

/** The markers that carry no length: start of image, end of image, and the RSTn codes. */
const MARKER_ONLY = new Set([0xd8, 0xd9, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

export const APP1 = 0xe1;

/**
 * Walks a JPEG's segment chain from the start of image to the start of scan.
 *
 * The chain is the format: every segment says how long it is, and the scan data at the end does
 * not. A truncated file simply stops, which is why the walk returns what it found rather than
 * throwing.
 */
export function readSegments(bytes: Uint8Array): readonly Segment[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segments: Segment[] = [];

  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];
  let at = 2;

  while (at + 4 <= bytes.byteLength) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1] ?? 0;

    if (MARKER_ONLY.has(marker)) {
      segments.push({ marker, at, headerBytes: 2, payloadBytes: 0 });
      at += 2;
      continue;
    }

    const length = view.getUint16(at + 2, false);
    if (length < 2 || at + 2 + length > bytes.byteLength) break;
    segments.push({ marker, at, headerBytes: 4, payloadBytes: length - 2 });
    at += 2 + length;

    // After the start of scan the rest is entropy-coded data, not segments.
    if (marker === 0xda) break;
  }

  return segments;
}

export type ExifTag = {
  readonly tag: number;
  readonly name: string;
  readonly value: string | number;
};

export type ExifTags = {
  readonly byteOrder: "little" | "big";
  readonly tags: readonly ExifTag[];
};

const NAMES: Readonly<Record<number, string>> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x0132: "DateTime",
  0x8769: "ExifIFD",
  0x8825: "GPSIFD",
};

const SIZES: Readonly<Record<number, number>> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

/**
 * The tags of the first IFD, read from the APP1 segment's payload.
 *
 * The payload starts with `Exif\0\0`, then a TIFF header that says the byte order and the offset of
 * the first directory. Every offset in the directory is relative to that header, not to the file,
 * which is the detail that makes a parser read a pointer as a value.
 */
export function parseExif(payload: Uint8Array): ExifTags | null {
  if (payload.byteLength < 14) return null;
  const header =
    payload[0] === 0x45 && payload[1] === 0x78 && payload[2] === 0x69 && payload[3] === 0x66;

  const tiffAt = header ? 6 : 0;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const order = view.getUint16(tiffAt, false);

  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;

  const magic = view.getUint16(tiffAt + 2, little);
  if (magic !== 42) return null;

  const ifdOffset = view.getUint32(tiffAt + 4, little);
  const at = tiffAt + ifdOffset;
  if (at + 2 > payload.byteLength) return null;

  const count = view.getUint16(at, little);
  const tags: ExifTag[] = [];

  for (let index = 0; index < count; index += 1) {
    const entry = at + 2 + index * 12;
    if (entry + 12 > payload.byteLength) break;

    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const length = view.getUint32(entry + 4, little);
    const size = SIZES[type] ?? 1;
    const total = size * length;

    const raw =
      total <= 4
        ? entry + 8
        : tiffAt + view.getUint32(entry + 8, little);

    tags.push({
      tag,
      name: NAMES[tag] ?? `0x${tag.toString(16).padStart(4, "0")}`,
      value: readValue(view, payload, raw, type, length, little),
    });
  }

  return { byteOrder: little ? "little" : "big", tags };
}

function readValue(
  view: DataView,
  payload: Uint8Array,
  at: number,
  type: number,
  length: number,
  little: boolean,
): string | number {
  if (at < 0 || at >= payload.byteLength) return "";

  if (type === 2) {
    // ASCII is NUL-terminated and padded; a decoder that keeps the padding prints blank lines.
    const end = Math.min(at + length, payload.byteLength);
    const bytes = payload.subarray(at, end);
    return new TextDecoder().decode(bytes).replace(/\0+$/, "");
  }

  if (type === 3) return view.getUint16(at, little);
  if (type === 4) return view.getUint32(at, little);
  if (type === 1) return payload[at] ?? 0;
  return 0;
}

/**
 * The same JPEG with every APP1 segment removed.
 *
 * Metadata is not part of the picture: a photo that leaves the tab with a GPS coordinate and a
 * camera serial in it is a privacy incident with a thumbnail attached. The strip is a copy of the
 * segments that are not APP1, and it keeps every byte of the image data.
 */
export function stripMetadata(bytes: Uint8Array): { readonly bytes: Uint8Array; readonly removed: number } {
  const segments = readSegments(bytes);
  const kept: Segment[] = [];
  let removed = 0;

  for (const segment of segments) {
    if (segment.marker === APP1) {
      removed += 1;
      continue;
    }
    kept.push(segment);
    if (segment.marker === 0xda) break;
  }

  if (removed === 0) return { bytes, removed: 0 };

  // Everything from the start of scan onward is copied verbatim, because it is not segmented.
  const scan = segments.find((segment) => segment.marker === 0xda);
  const tail = scan ? bytes.subarray(scan.at) : new Uint8Array(0);

  const head = kept
    .filter((segment) => segment.marker !== 0xda)
    .reduce((sum, segment) => sum + segment.headerBytes + segment.payloadBytes, 2);

  const out = new Uint8Array(head + tail.byteLength);
  out[0] = 0xff;
  out[1] = 0xd8;
  let writeAt = 2;

  for (const segment of kept) {
    if (segment.marker === 0xda) break;
    const length = segment.headerBytes + segment.payloadBytes;
    out.set(bytes.subarray(segment.at, segment.at + length), writeAt);
    writeAt += length;
  }

  out.set(tail, writeAt);
  return { bytes: out, removed };
}

/** The three tags a support reply actually needs, in one line per photo. */
export function describeTags(tags: ExifTags): string {
  const find = (name: string): string | number | undefined =>
    tags.tags.find((tag) => tag.name === name)?.value;

  const parts = [
    `make ${find("Make") ?? "?"}`,
    `model ${find("Model") ?? "?"}`,
    `orientation ${find("Orientation") ?? "1"}`,
    `taken ${find("DateTime") ?? "?"}`,
    `${tags.tags.length} tags, ${tags.byteOrder} endian`,
  ];
  return parts.join(", ");
}

/**
 * Writes an APP1 segment that this file's parser reads back.
 *
 * A parser proven only against files somebody else produced is a parser proven against one
 * muxer's habits. Writing the segment in the same file makes the fixture explicit: the offsets,
 * the byte order and the IFD layout are all visible, and the round trip is the test.
 */
export function buildExifSegment(tags: readonly { tag: number; value: string | number }[]): Uint8Array {
  const entries = tags.length;
  const ifdBytes = 2 + entries * 12 + 4;

  // Values longer than four bytes live after the directory, and their entry holds an offset
  // relative to the TIFF header. That base is the whole reason this function exists.
  const encoded = tags.map((tag) => {
    const isText = typeof tag.value === "string";
    const bytes = isText
      ? new TextEncoder().encode(`${tag.value}\0`)
      : new Uint8Array(2);
    if (!isText) new DataView(bytes.buffer).setUint16(0, Number(tag.value), true);
    return { tag, isText, bytes };
  });

  const dataBytes = encoded.reduce((sum, entry) => sum + (entry.bytes.byteLength > 4 ? entry.bytes.byteLength : 0), 0);
  const payload = new Uint8Array(6 + 8 + ifdBytes + dataBytes);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);

  const view = new DataView(payload.buffer);
  const tiff = 6;
  view.setUint16(tiff, 0x4949, false); // little endian
  view.setUint16(tiff + 2, 42, true);
  view.setUint32(tiff + 4, 8, true);
  view.setUint16(tiff + 8, entries, true);

  let dataAt = 8 + ifdBytes;
  encoded.forEach((entry, index) => {
    const at = tiff + 10 + index * 12;
    view.setUint16(at, entry.tag.tag, true);
    view.setUint16(at + 2, entry.isText ? 2 : 3, true);
    view.setUint32(at + 4, entry.isText ? entry.bytes.byteLength : 1, true);

    if (entry.bytes.byteLength <= 4) {
      payload.set(entry.bytes, at + 8);
    } else {
      view.setUint32(at + 8, dataAt, true);
      payload.set(entry.bytes, tiff + dataAt);
      dataAt += entry.bytes.byteLength;
    }
  });

  view.setUint32(tiff + 10 + entries * 12, 0, true);

  const segment = new Uint8Array(4 + payload.byteLength);
  segment[0] = 0xff;
  segment[1] = APP1;
  new DataView(segment.buffer).setUint16(2, payload.byteLength + 2, false);
  segment.set(payload, 4);
  return segment;
}

/** Inserts a segment after the start of image, which is where camera JPEGs keep their APP1. */
export function insertAfterSoi(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  const out = new Uint8Array(jpeg.byteLength + segment.byteLength);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.byteLength);
  return out;
}
