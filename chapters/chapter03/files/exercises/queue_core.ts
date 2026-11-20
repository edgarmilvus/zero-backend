/**
 * Exercise 5, file 1 of 3 - the pure part.
 *
 * The capstone's first question is "what is waiting and what is running", and that is a state
 * machine over a list of ids. No timers, no workers, no disk: a state in, a state out, which is
 * what makes the app's queue testable in a millisecond.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type State = {
  readonly limit: number;
  readonly queued: readonly string[];
  readonly running: readonly string[];
  readonly done: readonly string[];
};

export function newState(limit: number): State {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`limit: expected a positive integer, got ${limit}`);
  }
  return { limit, queued: [], running: [], done: [] };
}

export function enqueue(state: State, id: string): State {
  if (state.queued.includes(id) || state.running.includes(id) || state.done.includes(id)) {
    throw new Error(`job "${id}" is already known to this queue`);
  }
  return { ...state, queued: [...state.queued, id] };
}

/** Starts as many as the limit allows, and completes them, because the model has no time. */
export function step(state: State): State {
  const room = state.limit - state.running.length;
  const started = state.queued.slice(0, Math.max(0, room));
  if (started.length === 0) return state;
  return {
    ...state,
    queued: state.queued.slice(started.length),
    running: [],
    done: [...state.done, ...started],
  };
}

export function pending(state: State): number {
  return state.queued.length + state.running.length;
}

// --- the tests this file owns -------------------------------------------------

const queued = (...ids: string[]): State =>
  ids.reduce((state, id) => enqueue(state, id), newState(2));

export const checks: readonly Check[] = [
  {
    name: "a new state is empty",
    run: () => {
      const state = newState(3);
      eq(state.queued.length + state.running.length + state.done.length, 0, "empty");
      return eq(pending(state), 0, "pending");
    },
  },
  {
    name: "a limit of zero is refused",
    run: () => {
      const error = throws(() => newState(0), "zero");
      return expect(error.message.includes("positive"), error.message);
    },
  },
  {
    name: "enqueue returns a new state and leaves the old one alone",
    run: () => {
      const before = newState(2);
      const after = enqueue(before, "a");
      eq(before.queued.length, 0, "original");
      return eq(after.queued.join(","), "a", "copy");
    },
  },
  {
    name: "the same id twice is refused",
    run: () => {
      const error = throws(() => enqueue(queued("a"), "a"), "duplicate");
      return expect(error.message.includes('"a"'), error.message);
    },
  },
  {
    name: "a step starts no more than the limit and completes them",
    run: () => {
      const state = step(queued("a", "b", "c"));
      eq(state.done.join(","), "a,b", "done");
      return eq(state.queued.join(","), "c", "still queued");
    },
  },
];
