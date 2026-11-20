#!/usr/bin/env node
/**
 * Fails unless a chapter's browser server sends the two headers that make a
 * document cross-origin isolated.
 *
 *   node tools/check_headers.mjs chapter01
 *
 * The check is on the response, not on the source: it starts the chapter's own
 * server on an ephemeral port, fetches the document, finds the module the
 * document actually loads, fetches that too, and reads the headers back. A
 * constant in a file is not a header, and a module loaded without the headers is
 * a page that cannot use SharedArrayBuffer whatever the document says.
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
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
let passed = 0;

async function check(path, what) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) {
    failures.push(`${what} (${path}): ${response.status} ${response.statusText}`);
    return null;
  }
  for (const [name, value] of Object.entries(REQUIRED)) {
    const actual = response.headers.get(name);
    if (actual === value) {
      passed += 1;
    } else {
      failures.push(`${what} (${path}): ${name} is ${actual ?? "missing"}, expected ${value}`);
    }
  }
  return response;
}

const document = await check("/", "document");
let modulePath = "/client.ts";
if (document) {
  const html = await document.text();
  const match = html.match(/<script[^>]+src="([^"]+)"/i);
  // Resolve against the document's final URL, after any redirect: that is the URL
  // the browser resolves relative imports against.
  if (match) modulePath = new URL(match[1], document.url).pathname;
}

await check(modulePath, "module script");

server.close();

if (failures.length > 0) {
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(`${chapter}: headers FAILED (${passed}/4)`);
  process.exit(1);
}

console.log(`${chapter}: 2/2 headers ok (on the document and on ${modulePath})`);
