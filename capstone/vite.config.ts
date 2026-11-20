import { defineConfig } from "vite";

/**
 * The capstone imports the book's modules from `../chapters/...`, so Vite has to be allowed to
 * read outside its own root. That is deliberate: one copy of the code, the one the book prints.
 */
export default defineConfig({
  server: {
    fs: { allow: [".."] },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: { target: "es2022", outDir: "dist" },
});
