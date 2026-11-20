/**
 * Exercise 4 - the Parquet that lost a column.
 *
 * A file written by yesterday's build has four columns and today's query names five. A positional
 * reader reads the wrong value and calls it a schema change; a reader that matches by name refuses
 * the query and says which columns the file actually has.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export type Field = { readonly name: string; readonly type: "number" | "string" };
export type FileSchema = { readonly fields: readonly Field[] };
export type Row = Readonly<Record<string, string | number>>;

/** The file, by name. Extra columns in the row are ignored: a projection is a filter, not a copy. */
export function readRow(row: Row, schema: FileSchema, asked: readonly string[]): Record<string, string | number> {
  if (schema.fields.length === 0) throw new Error("schema: the file has no columns");

  const out: Record<string, string | number> = {};
  for (const name of new Set(asked)) {
    const field = schema.fields.find((candidate) => candidate.name === name);
    if (!field) {
      const available = schema.fields.map((candidate) => candidate.name).join(", ");
      throw new Error(`column ${name} is not in this file; it has ${available}`);
    }
    const value = row[name];
    if (value === undefined) throw new Error(`row: no value for ${name}`);
    if (typeof value !== field.type) {
      throw new Error(`column ${name}: file says ${field.type}, row has ${typeof value}`);
    }
    out[name] = value;
  }
  return out;
}

export const FILE: FileSchema = {
  fields: [
    { name: "id", type: "number" },
    { name: "kind", type: "number" },
    { name: "amount", type: "number" },
    { name: "label", type: "string" },
  ],
};

export const ROW: Row = { id: 7, kind: 3, amount: 12.5, label: "share", dropped: "yesterday" };

export const checks: readonly Check[] = [
  {
    name: "a column is read by name, not by position",
    run: () => eq(Object.keys(readRow(ROW, FILE, ["amount", "kind"])).join(","), "amount,kind", "keys"),
  },
  {
    name: "an extra column in the file is ignored",
    run: () => eq("dropped" in readRow(ROW, FILE, ["kind"]), false, "dropped"),
  },
  {
    name: "a column the file does not have is refused with the list",
    run: () => {
      const error = throws(() => readRow(ROW, FILE, ["user_id"]), "missing");
      expect(error.message.includes("id, kind, amount, label"), error.message);
      return expect(error.message.includes("user_id"), error.message);
    },
  },
  {
    name: "a type the file did not promise is refused",
    run: () => {
      const error = throws(() => readRow({ ...ROW, amount: "twelve" }, FILE, ["amount"]), "type");
      return expect(error.message.includes("file says number"), error.message);
    },
  },
  {
    name: "a repeated column is read once",
    run: () => eq(Object.keys(readRow(ROW, FILE, ["kind", "kind"])).join(","), "kind", "keys"),
  },
  {
    name: "an empty projection returns an empty row",
    run: () => eq(Object.keys(readRow(ROW, FILE, [])).length, 0, "keys"),
  },
  {
    name: "a file with no columns is refused",
    run: () => {
      const error = throws(() => readRow(ROW, { fields: [] }, ["kind"]), "empty schema");
      return expect(error.message.includes("no columns"), error.message);
    },
  },
  {
    name: "a row missing a requested value is refused",
    run: () => {
      const error = throws(() => readRow({ id: 1 }, FILE, ["kind"]), "missing value");
      return expect(error.message.includes("no value"), error.message);
    },
  },
  {
    name: "a string column comes back as a string",
    run: () => eq(readRow(ROW, FILE, ["label"]).label, "share", "label"),
  },
];

export function main(): number {
  console.log(`by name           ${JSON.stringify(readRow(ROW, FILE, ["amount", "kind"]))}`);
  try {
    readRow(ROW, FILE, ["user_id"]);
  } catch (error) {
    console.log(`missing column    ${(error as Error).message}`);
  }
  console.log("");
  console.log("position is a property of the file; name is a property of the query");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
