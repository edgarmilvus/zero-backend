/**
 * The MP4 box walker, and nothing else.
 *
 * An ISO base media file is a tree of length-prefixed boxes: four bytes of size, four bytes of
 * type, then either payload or more boxes. Reading that tree is a hundred lines, and the hundred
 * lines are the difference between "WebCodecs is hard" and "WebCodecs needs a container".
 */

export type Box = {
  readonly type: string;
  readonly start: number;
  readonly headerBytes: number;
  readonly bytes: number;
  readonly children: readonly Box[];
};

/** A cursor over one buffer, so no function has to carry two numbers round the code. */
export class BoxReader {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  u8(at: number): number {
    return this.view.getUint8(at);
  }

  u16(at: number): number {
    return this.view.getUint16(at, false);
  }

  u32(at: number): number {
    return this.view.getUint32(at, false);
  }

  /** The four-character type, as the file stores it. */
  type(at: number): string {
    return String.fromCharCode(
      this.bytes[at] ?? 0,
      this.bytes[at + 1] ?? 0,
      this.bytes[at + 2] ?? 0,
      this.bytes[at + 3] ?? 0,
    );
  }

  slice(start: number, end: number): Uint8Array {
    return this.bytes.subarray(start, end);
  }
}

/**
 * The boxes that contain boxes, and the ones that do not.
 *
 * A full list would be fifty entries; this is the path from the file to a codec's description,
 * which is the only path this chapter walks. A container whose children are not listed here is
 * treated as a leaf, which is safe: a leaf is a box you do not descend into, and the walker
 * reports it as such rather than guessing.
 */
const CONTAINERS = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "stsd",
  "dinf",
  "edts",
  "udta",
  "mvex",
  // Sample entries contain exactly one codec-configuration box, which is the one that matters.
  "avc1",
  "avc3",
  "hvc1",
  "hev1",
  "vp09",
  "av01",
  "mp4a",
]);

/**
 * How many bytes to skip after a box header before its first child box.
 *
 * `stsd` carries version, flags and an entry count. A visual sample entry carries 78 bytes of its
 * own fields before the codec configuration, and an audio entry 28. Getting these wrong does not
 * throw: it reads the fields as box headers and reports a tree of garbage.
 */
const SKIP_BEFORE_CHILDREN: Readonly<Record<string, number>> = {
  stsd: 8,
  avc1: 78,
  avc3: 78,
  hvc1: 78,
  hev1: 78,
  vp09: 78,
  av01: 78,
  mp4a: 28,
};

/** Reads the boxes at one level, and recurses into the containers. */
export function readBoxes(bytes: Uint8Array, from = 0, to = bytes.byteLength): readonly Box[] {
  const reader = new BoxReader(bytes);
  const boxes: Box[] = [];
  let at = from;

  while (at + 8 <= to) {
    const declared = reader.u32(at);
    const type = reader.type(at + 4);

    // 1 means a 64-bit size lives in the next eight bytes; 0 means "to the end of the file".
    let headerBytes = 8;
    let size = declared;
    if (declared === 1) {
      const high = reader.u32(at + 8);
      const low = reader.u32(at + 12);
      size = high * 2 ** 32 + low;
      headerBytes = 16;
    } else if (declared === 0) {
      size = to - at;
    }

    // A box that claims to run past the end of what we have is a truncated read, and trusting it
    // is how a parser walks off the buffer. Stop, and report what was read so far.
    if (size < headerBytes || at + size > to) break;

    const children = CONTAINERS.has(type)
      ? readBoxes(bytes, at + headerBytes + (SKIP_BEFORE_CHILDREN[type] ?? 0), at + size)
      : [];

    boxes.push({ type, start: at, headerBytes, bytes: size, children });
    at += size;
  }

  return boxes;
}

/** Every box in the tree, depth first, with its path written the way a bug report writes it. */
export function walk(boxes: readonly Box[], prefix = ""): readonly { path: string; box: Box }[] {
  const out: { path: string; box: Box }[] = [];
  for (const box of boxes) {
    const path = `${prefix}${box.type}`;
    out.push({ path, box });
    out.push(...walk(box.children, `${path}/`));
  }
  return out;
}

/** The first box whose path ends with this one, or null. `moov/trak/mdia/hdlr` is a path. */
export function find(boxes: readonly Box[], path: string): Box | null {
  const match = walk(boxes).find((entry) => entry.path === path);
  return match?.box ?? null;
}

/** The payload of a leaf box, which is where the fields a reader cares about live. */
export function payload(bytes: Uint8Array, box: Box): Uint8Array {
  return bytes.subarray(box.start + box.headerBytes, box.start + box.bytes);
}
