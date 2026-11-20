/**
 * The static server for this chapter's page, with the two isolation headers.
 *
 * It serves `files/` rather than `files/browser/` because the page imports `../detect.ts`
 * and `../probe.ts`: the probe the reader runs in the browser is the same file the harness
 * tests in node, and a copy under `browser/` would drift within a week.
 *
 *   node chapters/chapter02/files/browser/serve.mjs
 */

import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const createServerImpl = createHttpServer;

export const HEADERS = Object.freeze({
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
});

/** The two headers a cross-origin isolated page needs, and nothing else. */
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
};

// This chapter's server serves the whole `chapters/` tree, because the page imports
// `chapter03/files/storage.ts` for the refusal type it shares with this one. Every other
// chapter serves only its own `files/`; here the cross-chapter import is the point.
const ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const REPO = dirname(ROOT);
const CORE = join(REPO, "node_modules", "@ffmpeg", "core", "dist", "esm");

function inside(root, target) {
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(rootWithSep);
}

export function createServer(root = ROOT) {
  return createServerImpl(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const requested = decodeURIComponent(url.pathname);

    // `/` redirects instead of serving the page, so the document's own URL is
    // /browser/ and its relative imports resolve where the files really are. A
    // page served at "/" would import ./probe-client.ts from the root and 404.
    if (requested === "/") {
      response.writeHead(302, { ...HEADERS, Location: "/chapter04/files/browser/" });
      response.end();
      return;
    }

    // Bare specifiers need somewhere to point. The page carries an import map, and this mount
    // is what it resolves to: the package as npm installed it, not a copied bundle.
    if (requested.startsWith("/vendor/")) {
      const vendorRoot = join(REPO, "node_modules");
      const vendorTarget = normalize(join(vendorRoot, requested.slice("/vendor/".length)));
      if (!vendorTarget.startsWith(vendorRoot)) {
        response.writeHead(403, { ...HEADERS, "Content-Type": "text/plain" });
        response.end("outside node_modules\n");
        return;
      }
      try {
        const body = await readFile(vendorTarget);
        const extension = extname(vendorTarget);
        response.writeHead(200, {
          ...HEADERS,
          "Content-Type": MIME[extension] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        });
        response.end(body);
      } catch {
        response.writeHead(404, { ...HEADERS, "Content-Type": "text/plain" });
        response.end(`no vendor file at ${requested}\n`);
      }
      return;
    }

    // The 31 MB core is served from node_modules, not copied into the chapter: one copy, and
    // the version the page loads is the version the lockfile pins.
    if (requested.startsWith("/core/")) {
      const coreTarget = normalize(join(CORE, requested.slice("/core/".length)));
      try {
        const body = await readFile(coreTarget);
        response.writeHead(200, {
          ...HEADERS,
          "Content-Type": coreTarget.endsWith(".wasm") ? "application/wasm" : "text/javascript",
          // The page reports how many bytes of WebAssembly it downloaded, so the length matters.
          "Content-Length": String(body.byteLength),
          "Cache-Control": "no-store",
        });
        response.end(body);
      } catch {
        response.writeHead(404, { ...HEADERS, "Content-Type": "text/plain" });
        response.end(`no core at ${requested}: run npm ci first\n`);
      }
      return;
    }

    const pathname = requested.endsWith("/") ? `${requested}index.html` : requested;
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
        send(200, stripTypeScriptTypes(source, { mode: "strip" }), MIME[".ts"]);
        return;
      }
      send(200, await readFile(target), MIME[extension] ?? "application/octet-stream");
    } catch {
      send(404, `not found: ${pathname}\n`, "text/plain; charset=utf-8");
    }
  });
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 4324);
  createServer().listen(port, () => {
    console.log(`serving ${ROOT}`);
    console.log(`http://localhost:${port}/`);
  });
}
