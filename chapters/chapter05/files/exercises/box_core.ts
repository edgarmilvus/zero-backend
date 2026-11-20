/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * A box tree as a value: a type, a byte range, and children. No buffer ownership, no I/O, no
 * decoder. That is what lets the capstone read a container's shape on a machine that has no
 * WebCodecs at all.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Node = {
  readonly type: string;
  readonly start: number;
  readonly bytes: number;
  readonly children: readonly Node[];
};

/** The boxes a reader descends into, and the bytes to skip before their first child. */
const CONTAINERS: Readonly<Record<string, number>> = {
  moov: 0,
  trak: 0,
  mdia: 0,
  minf: 0,
  stbl: 0,
  stsd: 8,
  avc1: 78,
  mp4a: 28,
};

/** Reads one level of a tree from a buffer, and recurses. */
export function read(bytes: Uint8Array, from = 0, to = bytes.byteLength): readonly Node[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nodes: Node[] = [];
  let at = from;

  while (at + 8 <= to) {
    const size = view.getUint32(at, false);
    if (size < 8 || at + size > to) break;
    const type = String.fromCharCode(
      bytes[at + 4] ?? 0,
      bytes[at + 5] ?? 0,
      bytes[at + 6] ?? 0,
      bytes[at + 7] ?? 0,
    );
    const skip = CONTAINERS[type];
    nodes.push({
      type,
      start: at,
      bytes: size,
      children:
        skip === undefined ? [] : read(bytes, at + 8 + skip, at + size),
    });
    at += size;
  }

  return nodes;
}

export function children(nodes: readonly Node[], type: string): readonly Node[] {
  const match = nodes.find((node) => node.type === type);
  if (!match) throw new Error(`no box of type "${type}" at this level`);
  return match.children;
}

export function path(nodes: readonly Node[]): readonly string[] {
  return nodes.flatMap((node) =>
    [node.type, ...path(node.children).map((child) => `${node.type}/${child}`)],
  );
}

// --- the tests this file owns -------------------------------------------------

function box(type: string, declared: number, payload: number): Uint8Array {
  const buffer = new Uint8Array(8 + payload);
  new DataView(buffer.buffer).setUint32(0, declared);
  buffer.set([...type].map((character) => character.charCodeAt(0)), 4);
  return buffer;
}

export const checks: readonly Check[] = [
  {
    name: "one valid box is one node",
    run: () => eq(read(box("free", 16, 8)).length, 1, "nodes"),
  },
  {
    name: "a box that does not fit stops the walk",
    run: () => eq(read(box("moov", 999, 8)).length, 0, "nodes"),
  },
  {
    name: "a container is descended into",
    run: () => {
      const outer = box("moov", 24, 16);
      const inner = box("mvhd", 16, 8);
      outer.set(inner, 8);
      const nodes = read(outer);
      return eq(nodes[0]?.children.length, 1, "children");
    },
  },
  {
    name: "asking for a container that is not there throws by name",
    run: () => {
      const error = throws(() => children(read(box("free", 16, 8)), "moov"), "missing");
      return expect(error.message.includes("moov"), error.message);
    },
  },
  {
    name: "the path list names every box and its parent",
    run: () => {
      const outer = box("moov", 24, 16);
      outer.set(box("mvhd", 16, 8), 8);
      return eq(path(read(outer)).join(","), "moov,moov/mvhd", "paths");
    },
  },
];
