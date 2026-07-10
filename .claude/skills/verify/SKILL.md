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
npm run bundle:viewer   # REQUIRED if canvas-plugin/viewer/* changed (self-hosted bundle)
node cli/bin/publish.mjs build test-vault --config docs/current/config/minimal-site.json --out out/public
```
Serve either with `node cli/bin/publish.mjs preview out/public --port 8080`, or in a driver script import the real server (pattern from `scripts/e2e-smoke.mjs`):
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
- Wait for the viewer: `.canvas-page-mount .JSON-Canvas-Viewer`, then ~800ms for async fragment fetches.
- Viewer controls: fullscreen toggle is the FIRST `.JCV-button` inside `.JCV-controls-content`.

## Gotchas
- **Links inside canvas cards need TWO clicks**: the viewer's `JCV-click-layer` intercepts the first click (card select, Obsidian-Publish behavior). Playwright's `locator.click()` times out on "intercepts pointer events" — use two raw `page.mouse.click(x, y)` at the link's bounding-box center, ~300ms apart.
- **Esc does not exit fullscreen in headless Chromium** (browser-UI chrome, not DOM). Exit via the same JCV toggle button.
- Native `requestFullscreen` DOES work in headless Chromium; assert via `document.fullscreenElement`.
- Screenshots go to `.out/` (gitignored); temp driver scripts to `.tmp/` (gitignored).
