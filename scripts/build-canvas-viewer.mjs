#!/usr/bin/env node
/**
 * Bundles the CanvasView wrapper (the sole hesprs owner) into a single
 * self-hosted ESM file: canvas-plugin/dist/canvas-viewer.js. No CDN at runtime.
 * Run via `npm run bundle:viewer` (also part of `npm run setup`).
 */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import path from "node:path"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const result = await build({
  entryPoints: [path.join(repoRoot, "canvas-plugin", "viewer", "canvasView.js")],
  outfile: path.join(repoRoot, "canvas-plugin", "dist", "canvas-viewer.js"),
  bundle: true,
  format: "esm",
  minify: true,
  metafile: true,
  logLevel: "silent",
})

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0
console.log(`canvas-viewer.js bundled (${(bytes / 1024).toFixed(1)} KB min)`)
