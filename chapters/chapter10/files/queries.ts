/**
 * The chapter's SQL, as data, and the arithmetic that checks it.
 *
 * This file is the portable half of the chapter: it imports nothing, it runs in node and in a page,
 * and the two bindings differ only in how they hand these strings to the engine.
 *
 * The table is generated rather than shipped. A million rows in a fixture is a megabyte of bytes
 * nobody reads; a million rows from `range()` and two modular multiplications is the same table,
 * reproducible on any machine, with no random seed to record.
 */

export const ROW_COUNT = 1_000_000;

export const KINDS = ["read", "write", "share", "delete", "login", "logout", "sync"] as const;
export type Kind = (typeof KINDS)[number];

/**
 * The columns, and why each one exists.
 *
 * `user_id` is a modular hash of the row number, which is enough to make a group by with a thousand
 * groups and no index. `amount` is a two-decimal number because money is the aggregate a reader
 * recognises, and because a float sum is the one number that has to match to the cent.
 */
export const CREATE_EVENTS = `create table events as
  select i::bigint                                 as id,
         (i * 2654435761 % 1000)::int              as user_id,
         (i % ${KINDS.length})::int                as kind,
         (i % 365)::int                            as day,
         ((i * 7919) % 100000) / 100.0             as amount
  from range(${ROW_COUNT}) t(i)`;

export const COUNT_EVENTS = "select count(*)::bigint as n from events";

/**
 * The same aggregate over a table or a file.
 *
 * The source is a parameter because the chapter runs the identical query twice: once against the
 * generated table and once against `events.parquet`. A second copy of the SQL would be a second
 * query, and the comparison would be between two things that only look alike.
 */
export function aggregateFrom(source: string): string {
  return `select kind,
         count(*)::bigint as n,
         sum(amount)      as total,
         avg(amount)      as mean
    from ${source}
   group by kind
   order by kind`;
}

export function countFrom(source: string): string {
  return `select count(*)::bigint as n from ${source}`;
}

export const AGGREGATE_BY_KIND = aggregateFrom("events");

export const TOP_USERS = `select user_id, count(*)::bigint as n
    from events
   group by user_id
   order by n desc, user_id asc
   limit 10`;

/** The five columns a `select *` reads, and the two a scan of `kind` alone needs. */
export const PROJECTED_COLUMNS = ["kind", "amount"] as const;

/** The total of a column whose value is `((i * 7919) % 100000) / 100`. */
export function expectedSum(rows: number = ROW_COUNT): number {
  let total = 0;
  for (let i = 0; i < rows; i += 1) total += ((i * 7919) % 100_000) / 100;
  return total;
}

/** How many rows land on `kind`, which is one residue class out of seven. */
export function expectedKindCount(kind: number, rows: number = ROW_COUNT): number {
  if (!Number.isInteger(kind) || kind < 0 || kind >= KINDS.length) {
    throw new Error(`kind ${kind}: expected an integer in 0..${KINDS.length - 1}`);
  }
  if (rows <= kind) return 0;
  return Math.floor((rows - 1 - kind) / KINDS.length) + 1;
}

/** The sum, per kind, computed without a database: the assertion the engine has to match. */
export function expectedSums(rows: number = ROW_COUNT): number[] {
  const sums = new Array<number>(KINDS.length).fill(0);
  for (let i = 0; i < rows; i += 1) sums[i % KINDS.length] = (sums[i % KINDS.length] ?? 0) + ((i * 7919) % 100_000) / 100;
  return sums;
}
