/**
 * The schema as data: numbered migrations, applied in order, never edited once shipped.
 *
 * A migration is a version and a statement. The list is append-only because a book, like a product,
 * has users who upgraded yesterday: the version they have is a fact about their file, and a migration
 * that rewrites history is how a database ends up with two shapes and no way to tell which.
 */

export type Migration = {
  readonly version: number;
  readonly name: string;
  readonly up: readonly string[];
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "documents",
    up: [
      `create table docs (
         id bigserial primary key,
         title text not null,
         body text not null,
         created_at timestamptz not null default now()
       )`,
    ],
  },
  {
    version: 2,
    name: "searchable tags",
    up: [
      `alter table docs add column tags text[] not null default '{}'`,
      `create index docs_tags_idx on docs using gin (tags)`,
    ],
  },
  {
    version: 3,
    name: "a cheap sort",
    up: [`create index docs_created_idx on docs (created_at desc)`],
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce((latest, migration) => Math.max(latest, migration.version), 0);

/**
 * The migrations a database at `from` still needs, in order.
 *
 * A database at a version the code does not know about is not "up to date": it is a file written by a
 * newer build, and the only safe answer is to refuse it rather than to run an old migration over it.
 */
export function upTo(from: number): readonly Migration[] {
  if (!Number.isInteger(from) || from < 0) {
    throw new Error(`version: expected a non-negative integer, got ${from}`);
  }
  if (from > LATEST_VERSION) {
    throw new Error(
      `version ${from} is newer than this build's ${LATEST_VERSION}: the file was written by a later version`,
    );
  }
  return MIGRATIONS.filter((migration) => migration.version > from).sort((a, b) => a.version - b.version);
}

/** The list must be gapless and sorted, or a database can skip a step and never notice. */
export function assertMigrations(): void {
  for (const [index, migration] of MIGRATIONS.entries()) {
    if (migration.version !== index + 1) {
      throw new Error(`migration ${index} has version ${migration.version}, expected ${index + 1}`);
    }
    if (migration.up.length === 0) throw new Error(`migration ${migration.version} has no statements`);
  }
}
