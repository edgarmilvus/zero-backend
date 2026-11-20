/**
 * A version is a counter and a name.
 *
 * The counter orders the writes one device made to itself; the name breaks the tie between devices
 * that never saw each other's counters. Together they are a total order, which is the only thing the
 * merge needs: given two versions, a function that says which one is later.
 */

export type Version = {
  readonly counter: number;
  readonly actor: string;
};

export function actor(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("actor: a name is required, or two devices are one");
  if (trimmed.length > 64) throw new Error(`actor: ${trimmed.length} characters, the limit is 64`);
  return trimmed;
}

export function version(counter: number, name: string): Version {
  if (!Number.isInteger(counter) || counter < 1) throw new Error(`counter: ${counter} is not a positive integer`);
  return { counter, actor: actor(name) };
}

/** The next version for this device: its own counter, one higher, under its own name. */
export function tick(previous: Version | undefined, name: string): Version {
  return version((previous?.counter ?? 0) + 1, name);
}

/**
 * The total order: counter first, then the actor's name.
 *
 * The name is compared as a string and not as a device id, because the comparison has to be the same
 * on every machine. `localeCompare` is not: it depends on a collation the two devices may not share,
 * and two merges that disagree about which write is later do not converge.
 */
export function compare(left: Version, right: Version): number {
  if (left.counter !== right.counter) return left.counter < right.counter ? -1 : 1;
  if (left.actor === right.actor) return 0;
  return left.actor < right.actor ? -1 : 1;
}

export function later(left: Version, right: Version): Version {
  return compare(left, right) >= 0 ? left : right;
}

export function same(left: Version, right: Version): boolean {
  return compare(left, right) === 0;
}

/** The version of a set of entries, which is what a replica reports as its own clock. */
export function highest(versions: readonly Version[]): Version | undefined {
  return versions.reduce<Version | undefined>((best, candidate) => (best === undefined ? candidate : later(best, candidate)), undefined);
}
