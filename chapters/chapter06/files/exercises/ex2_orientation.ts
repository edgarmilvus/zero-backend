/**
 * Exercise 2 - the photo that is sideways on one browser.
 *
 * An iPhone writes Orientation 6 and leaves the pixels landscape. A browser that honours the tag
 * shows a portrait photo; a canvas that draws the pixels shows a landscape one on its side. The
 * page has to rotate, and the rotation is a function of the tag.
 */

import { eq, expect, type Check } from "./selfcheck.ts";

export type Draw = { readonly rotate: 0 | 90 | 180 | 270; readonly flip: boolean };

/**
 * The mapping from the eight EXIF orientations to a canvas transform.
 *
 * Values 2, 4, 5 and 7 involve a mirror, which is why a pipeline that only handles 1, 3, 6 and 8
 * still gets a wrong picture on a scanned document.
 */
export function transformFor(orientation: number): Draw {
  switch (orientation) {
    case 2:
      return { rotate: 0, flip: true };
    case 3:
      return { rotate: 180, flip: false };
    case 4:
      return { rotate: 180, flip: true };
    case 5:
      return { rotate: 90, flip: true };
    case 6:
      return { rotate: 90, flip: false };
    case 7:
      return { rotate: 270, flip: true };
    case 8:
      return { rotate: 270, flip: false };
    default:
      return { rotate: 0, flip: false };
  }
}

/** The size after the transform: a 90 or 270 rotation swaps the axes. */
export function drawnSize(width: number, height: number, draw: Draw): { width: number; height: number } {
  return draw.rotate === 90 || draw.rotate === 270
    ? { width: height, height: width }
    : { width, height };
}

export const checks: readonly Check[] = [
  {
    name: "orientation 1 is the identity",
    run: () => eq(transformFor(1).rotate, 0, "rotate"),
  },
  {
    name: "orientation 6 is a quarter turn",
    run: () => eq(transformFor(6).rotate, 90, "rotate"),
  },
  {
    name: "orientation 8 is the other quarter turn",
    run: () => eq(transformFor(8).rotate, 270, "rotate"),
  },
  {
    name: "orientation 3 is upside down",
    run: () => eq(transformFor(3).rotate, 180, "rotate"),
  },
  {
    name: "orientation 2 is a mirror with no rotation",
    run: () => eq(transformFor(2).flip, true, "flip"),
  },
  {
    name: "an unknown orientation is treated as the identity",
    run: () => {
      const draw = transformFor(99);
      eq(draw.rotate, 0, "rotate");
      return eq(draw.flip, false, "flip");
    },
  },
  {
    name: "a quarter turn swaps the axes",
    run: () => {
      const size = drawnSize(4032, 3024, transformFor(6));
      eq(size.width, 3024, "width");
      return eq(size.height, 4032, "height");
    },
  },
  {
    name: "a half turn keeps them",
    run: () => {
      const size = drawnSize(4032, 3024, transformFor(3));
      eq(size.width, 4032, "width");
      return eq(size.height, 3024, "height");
    },
  },
  {
    name: "a mirror keeps them too",
    run: () => {
      const size = drawnSize(800, 600, transformFor(2));
      eq(size.width, 800, "width");
      return eq(size.height, 600, "height");
    },
  },
];

export function main(): number {
  for (const orientation of [1, 2, 3, 6, 8]) {
    const draw = transformFor(orientation);
    const size = drawnSize(4032, 3024, draw);
    console.log(
      `orientation ${orientation}  rotate ${String(draw.rotate).padStart(3)}  flip ${String(draw.flip).padEnd(5)}  drawn ${size.width}x${size.height}`,
    );
  }
  console.log("");
  console.log("the pixels did not move; the canvas did");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
