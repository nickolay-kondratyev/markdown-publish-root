---
name: verify
description: Build the test-vault site, serve it with the real preview server, and drive it in headless Chromium to observe canvas/site behavior end-to-end.
---

# Verify this repo's changes at the browser surface

## Environment
- Node: `~/.nvm/versions/node/v26.4.0/bin/node` (default `node` is v20 — cannot type-strip `.ts` test files; put v26 first on PATH). Makefile says `nvm use 25`; in this sandbox only v26 exists and works.
- Browser: system Chromium at `/usr/bin/chromium` driven via `playwright-core` (already in node_modules). No downloaded Playwright browsers.

## Build + serve
```bash
export PATH=~/.nvm/versions/node/v26.4.0/bin:$PATH
npm run bundle:viewer   # REQUIRED if canvas-plugin/viewer/* changed (self-hosted React Flow bundle)
node cli/bin/publish.mjs build test-vault --config docs/current/config/minimal-site.json --out out/public
```
Serve either with `node cli/bin/publish.mjs preview out/public --port 8080`, or in a driver script import the real server (or reuse `scripts/lib/e2eHarness.mjs` — build/serve/launch/error-filter helpers used by both e2e scripts):
```js
import { PreviewServer } from "../cli/src/preview/previewServer.ts"
const address = await new PreviewServer("out/public").start(0) // port 0 = free port
```

## Drive (playwright-core pattern)
```js
const { chromium } = await import("playwright-core")
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] })
```
- Canvas pages: `/canvases/main.canvas` and `/canvases/second.canvas` (extensionless URLs work; main links to second and back — good for SPA-nav flows).
- The viewer is React Flow (ADR 0003). Wait for `.canvas-page-mount .react-flow__node`, then ~900ms for async fragment fetches.
- Nodes are addressable by JSON Canvas id: `.react-flow__node[data-id="text-welcome"]`.
- Controls: `.react-flow__controls` buttons titled `Zoom In` / `Zoom Out` / `Fit View`; the fullscreen toggle is `.canvas-flow-fullscreen`. Minimap: `.react-flow__minimap`.
- The extensive canvas e2e already covers most flows: `node scripts/e2e-canvas-flow.mjs` (47 checks).

## Gotchas
- **Links inside canvas cards need TWO clicks**: a transparent `.canvas-node-click-guard` overlay intercepts the first click (card select, Obsidian-Publish behavior); it lifts once the node has the `selected` class. Playwright's `locator.click()` times out on "intercepts pointer events" — use two raw `page.mouse.click(x, y)` (~300ms apart): card center first, then the link's bounding-box center.
- **The minimap overlays bottom-right cards** — pan the viewport first (drag on the pane) if the target card sits under it.
- **Wheel does not zoom until the user has clicked/tapped the canvas once** (mistouch gate); pointerdown anywhere on the viewer arms it.
- **Esc does not exit fullscreen in headless Chromium** (browser-UI chrome, not DOM). Exit via `.canvas-flow-fullscreen`.
- Native `requestFullscreen` DOES work in headless Chromium; assert via `document.fullscreenElement` (it is the `[data-canvas-mount]` div).
- **Theme testing**: mirror Quartz's real toggle — set `<html saved-theme="dark">` (drives card CSS vars) AND dispatch `themechange` (drives React Flow's colorMode).
- Screenshots go to `.out/` (gitignored); temp driver scripts to `.tmp/` (gitignored).
