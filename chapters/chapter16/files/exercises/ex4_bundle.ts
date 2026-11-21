/**
 * Exercise 4 - the bundle with a dependency in it.
 *
 * One import left in a concatenated bundle is a file that fails at the first line in a browser, and
 * the size check passes because the file is small. The exercise is the check, not the strip.
 */

import { eq, expect, throws, type Check } from "./selfcheck.ts";

export function stripImports(source: string): string {
  return source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "");
}

export function assertNoImports(source: string): void {
  if (/^\s*import\s/m.test(source)) throw new Error("bundle: an import survived the strip");
  if (/\brequire\(/.test(source)) throw new Error("bundle: a require survived the strip");
}

export const checks: readonly Check[] = [
  { name: "a simple import is removed", run: () => eq(stripImports('import { a } from "./a.ts";\nconst x = 1;').trim(), "const x = 1;", "code") },
  { name: "a multi-line import is removed", run: () => eq(stripImports('import {\n  a,\n  b,\n} from "./a.ts";\nconst x = 1;').trim(), "const x = 1;", "code") },
  { name: "several imports are removed", run: () => eq(stripImports('import { a } from "./a.ts";\nimport { b } from "./b.ts";\nconst x = 1;').trim(), "const x = 1;", "code") },
  { name: "an import inside a string is not removed", run: () => expect(stripImports('const s = "import { a } from \'./a.ts\';";').includes("import"), "over-stripped") },
  { name: "a bundle with no import passes", run: () => expect(assertNoImports("const x = 1;") === undefined, "threw") },
  { name: "a surviving import throws", run: () => {
    const error = throws(() => assertNoImports('import { a } from "./a.ts";'), "import");
    return expect(error.message.includes("survived"), error.message);
  } },
  { name: "a surviving require throws", run: () => {
    const error = throws(() => assertNoImports("const x = require('fs');"), "require");
    return expect(error.message.includes("require"), error.message);
  } },
  { name: "a comment mentioning import does not throw", run: () => expect(assertNoImports("// import is a word\nconst x = 1;") === undefined, "threw") },
  { name: "the strip is idempotent", run: () => {
    const once = stripImports('import { a } from "./a.ts";\nconst x = 1;');
    return eq(stripImports(once), once, "stable");
  } },
];

export function main(): number {
  console.log(`stripped          ${JSON.stringify(stripImports('import { a } from "./a.ts";\nconst x = 1;'))}`);
  console.log("");
  console.log("a bundle is only a bundle when no import survived");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
