/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * Which of two versions is later, how many keys disagree, and whether two states are the same
 * document. No replica, no file, no clock.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type V = { readonly counter: number; readonly actor: string };

export function later(left: V, right: V): V {
  if (left.counter !== right.counter) return left.counter > right.counter ? left : right;
  return left.actor >= right.actor ? left : right;
}

export function conflicts(left: Readonly<Record<string, V>>, right: Readonly<Record<string, V>>): number {
  let count = 0;
  for (const [key, entry] of Object.entries(right)) {
    const mine = left[key];
    if (mine !== undefined && (mine.counter !== entry.counter || mine.actor !== entry.actor)) count += 1;
  }
  return count;
}

export function converged(left: Readonly<Record<string, V>>, right: Readonly<Record<string, V>>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const a = left[key];
    const b = right[key];
    if (!a || !b) return false;
    if (a.counter !== b.counter || a.actor !== b.actor) return false;
  }
  return true;
}

export const checks: readonly Check[] = [
  { name: "a higher counter is later", run: () => eq(later({ counter: 2, actor: "a" }, { counter: 1, actor: "z" }).counter, 2, "later") },
  { name: "at the same counter the larger actor wins", run: () => eq(later({ counter: 2, actor: "a" }, { counter: 2, actor: "b" }).actor, "b", "actor") },
  { name: "two keys with different versions are two conflicts", run: () => eq(conflicts({ a: { counter: 1, actor: "x" }, b: { counter: 1, actor: "x" } }, { a: { counter: 2, actor: "x" }, b: { counter: 1, actor: "y" } }), 2, "conflicts") },
  { name: "the same map is converged", run: () => expect(converged({ a: { counter: 1, actor: "x" } }, { a: { counter: 1, actor: "x" } }), "different") },
  { name: "a key missing on one side is not converged", run: () => expect(!converged({ a: { counter: 1, actor: "x" } }, {}), "converged") },
];
