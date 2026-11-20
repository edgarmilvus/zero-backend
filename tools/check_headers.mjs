#!/usr/bin/env node
/**
 * Fails unless a chapter's browser server sends the two headers that make a
 * document cross-origin isolated.
 *
 *   node tools/check_headers.mjs chapter01
 *
 * The check is on the response, not on the source: it starts the chapter's own
 * server on an ephemeral port, fetches the document and the module script, and
 * reads the headers back. A constant in a file is not a header.
 */

const chapter = process.argv[2] ?? "chapter01";

// The type stripper is experimental and announces itself on every import.
// This tool is not the place a reader should meet that warning.
process.removeAllListeners("warning");
process.on("warning", () => {});

const REQUIRED = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
};

async function load(chapterId) {
  const url = new URL(
    `../chapters/${chapterId}/files/browser/serve.mjs`,
    import.meta.url,
  );
  try {
    return await import(url.href);
  } catch (error) {
    console.error(`${chapterId}: no browser server at ${url.pathname}`);
    console.error(`  ${error.message}`);
    process.exit(2);
  }
}

const serverModule = await load(chapter);
const server = serverModule.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

let passed = 0;
const failures = [];

for (const path of ["/", "/client.ts"]) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) {
    failures.push(`${path}: ${response.status} ${response.statusText}`);
    continue;
  }
  for (const [name, value] of Object.entries(REQUIRED)) {
    const actual = response.headers.get(name);
    if (actual === value) {
      passed += 1;
    } else {
      failures.push(`${path}: ${name} is ${actual ?? "missing"}, expected ${value}`);
    }
  }
}

server.close();

if (failures.length > 0) {
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(`${chapter}: headers FAILED (${passed}/4)`);
  process.exit(1);
}

console.log(`${chapter}: 2/2 headers ok (on the document and on the module script)`);
