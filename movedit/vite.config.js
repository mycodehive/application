import { defineConfig } from "vite";

export default defineConfig({
  root: "source",
  base: "./",
  publicDir: false,
  build: {
    target: "es2022",
    outDir: "../dist",
    assetsDir: "bundle",
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  }
});
