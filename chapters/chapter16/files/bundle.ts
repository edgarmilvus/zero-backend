/**
 * The bundle: strip the types, drop the imports, concatenate, wrap in HTML.
 *
 * There is no bundler here on purpose. Three modules with no external dependency concatenate in
 * dependency order, and the check that no `import` survived is the whole build's correctness test.
 */

import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BUDGET_BYTES, bytesOf } from "./budget.ts";

export { BUDGET_BYTES };

const HERE = dirname(fileURLToPath(import.meta.url));

/** Dependency order: model, store, app. The bundle is this array and nothing else. */
export const MODULES = ["model.ts", "store.ts", "app.ts"] as const;

export function stripModule(source: string, name: string): string {
  let js: string;
  try {
    js = stripTypeScriptTypes(source, { mode: "strip" });
  } catch (error) {
    throw new Error(`${name}: the type stripper refused it: ${(error as Error).message}`);
  }

  const withoutImports = js.replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, "");
  const withoutExports = withoutImports.replace(/^export\s+(?=(const|let|var|function|class|async))/gm, "");

  if (/^\s*import\s/m.test(withoutExports)) {
    throw new Error(`${name}: an import survived the strip; the bundle would fail at the first line`);
  }
  return withoutExports.trim();
}

export function bundleHtml(parts: readonly { name: string; code: string }[]): string {
  const code = `${parts.map((part) => `// --- ${part.name}\n${part.code}`).join("\n\n")}\n\nmain();\n`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Notes, one file</title>
<style>
  :root { color-scheme: light; }
  body { font: 15px/1.6 ui-serif, Georgia, serif; margin: 0 auto; padding: 28px; max-width: 760px; background: #f7f3e8; color: #1c1a17; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  #status, #count { font: 12px/1.5 ui-monospace, monospace; color: #6b6355; margin: 0 0 14px; }
  form { display: grid; gap: 6px; margin-bottom: 18px; }
  input, textarea, button { font: inherit; font-size: 14px; padding: 6px 8px; }
  textarea { min-height: 56px; }
  .row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { border-top: 1px solid #ddd4bf; padding: 10px 0; position: relative; }
  li strong { font-size: 15px; }
  li p { margin: 2px 0 0; white-space: pre-wrap; }
  li button { position: absolute; right: 0; top: 10px; font-size: 11px; }
  #find { width: 100%; margin-bottom: 12px; }
</style>
</head>
<body>
<h1>Notes, one file</h1>
<p id="status">loading</p>
<p id="count"></p>
<form id="add">
  <input id="title" placeholder="title" autocomplete="off" />
  <textarea id="body" placeholder="body"></textarea>
  <div class="row">
    <button type="submit">Add</button>
    <button type="button" id="share">Make a share link</button>
    <button type="button" id="export">Export one file</button>
    <label style="font-size:12px;align-self:center">Import <input type="file" id="import" accept="text/html" style="font-size:11px" /></label>
  </div>
</form>
<input id="find" placeholder="search" autocomplete="off" />
<ul id="notes"></ul>
<script>${code}</script>
</body>
</html>
`;
}

export type Build = {
  readonly html: string;
  readonly bytes: number;
  readonly parts: readonly { name: string; bytes: number }[];
  readonly fits: boolean;
};

export function buildApp(budget = BUDGET_BYTES): Build {
  const parts = MODULES.map((name) => {
    const source = readFileSync(join(HERE, name), "utf8");
    const code = stripModule(source, name);
    return { name, code, bytes: bytesOf(code) };
  });
  const html = bundleHtml(parts);
  const total = bytesOf(html);
  return {
    html,
    bytes: total,
    parts: parts.map(({ name, bytes }) => ({ name, bytes })),
    fits: total <= budget,
  };
}

export { bytesOf };
