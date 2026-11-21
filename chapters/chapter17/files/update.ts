/**
 * Updates a file can do: compare versions, show the newer one, and refuse a downgrade.
 *
 * The app cannot install anything. What it can do is read the build id it carries and compare it with a
 * build id the user pasted, and tell them whether the file in their hand is older — which is the only
 * update question a file can answer.
 */

export type Version = { readonly major: number; readonly minor: number; readonly patch: number };

export function parseVersion(text: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  if (!match) throw new Error(`version: ${text} is not major.minor.patch`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Numeric, field by field: 0.10.0 is newer than 0.9.0, which a string sort gets backwards. */
export function compare(left: Version, right: Version): number {
  if (left.major !== right.major) return left.major < right.major ? -1 : 1;
  if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
  if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
  return 0;
}

export function isNewer(candidate: Version, current: Version): boolean {
  return compare(candidate, current) > 0;
}

/** What a file can say about an update: newer, same, or older (and a downgrade loses data). */
export function verdict(current: string, candidate: string): "newer" | "same" | "older" {
  const relation = compare(parseVersion(candidate), parseVersion(current));
  return relation > 0 ? "newer" : relation === 0 ? "same" : "older";
}

export function manifest(build: string, notes: number): string {
  return JSON.stringify({ build, notes });
}
