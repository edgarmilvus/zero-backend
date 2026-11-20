/**
 * The only server this book allows itself: a static file server for localhost,
 * which exists to send two headers.
 *
 * Multi-threaded WebAssembly needs SharedArrayBuffer, and a browser only exposes
 * SharedArrayBuffer to a document that is cross-origin isolated. That is what
 * these two headers do:
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 * Chapter 18 spends a chapter on what happens without them. Chapter 1 already
 * needs them, because the client measurement runs off the main thread.
 *
 * TypeScript is stripped on the way out, by the same engine that runs the
 * chapter's harness, so the reader edits one file and the browser loads it.
 */

import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const HEADERS = Object.freeze({
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
});

/** The two headers a cross-origin-isolated page needs, and nothing else. */
export function headerPolicy() {
  return {
    "Cross-Origin-Opener-Policy": HEADERS["Cross-Origin-Opener-Policy"],
    "Cross-Origin-Embedder-Policy": HEADERS["Cross-Origin-Embedder-Policy"],
  };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const ROOT = dirname(fileURLToPath(import.meta.url));

function inside(root, target) {
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(rootWithSep);
}

export function createServer(root = ROOT) {
  return createHttpServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = normalize(join(root, pathname));

    const send = (status, body, type) => {
      response.writeHead(status, {
        ...HEADERS,
        "Content-Type": type,
        "Cache-Control": "no-store",
      });
      response.end(body);
    };

    if (!inside(root, target)) {
      send(403, "outside the served directory\n", "text/plain; charset=utf-8");
      return;
    }

    try {
      const info = await stat(target);
      if (!info.isFile()) {
        send(404, `not a file: ${pathname}\n`, "text/plain; charset=utf-8");
        return;
      }

      const extension = extname(target);
      if (extension === ".ts") {
        const source = await readFile(target, "utf8");
        const stripped = stripTypeScriptTypes(source, { mode: "strip" });
        send(200, stripped, MIME[".ts"]);
        return;
      }

      send(200, await readFile(target), MIME[extension] ?? "application/octet-stream");
    } catch {
      send(404, `not found: ${pathname}\n`, "text/plain; charset=utf-8");
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 4321);
  const server = createServer();
  server.listen(port, () => {
    console.log(`serving ${ROOT}`);
    console.log(`http://localhost:${port}/`);
    console.log("cross-origin isolated: " + JSON.stringify(headerPolicy()));
  });
}
