# ADR 0003: React Flow replaces the hesprs canvas renderer

**Status:** Accepted (Nickolay, 2026-07-10)
**Supersedes:** the renderer choice of ADR 0001 (the pageType-plugin decision
there still stands unchanged).

## Context

ADR 0001 mounted the hesprs `json-canvas-viewer` behind a renderer-isolation
boundary (plan §4.3) designed to make exactly this swap cheap. Nickolay
directed the migration to React Flow (`@xyflow/react`, MIT) — the §2.1
"do not switch unilaterally" trigger was exercised by the owner.

## Decision

Replace the viewer implementation under `canvas-plugin/viewer/` with a React
Flow app (real `react`/`react-dom`, not preact-compat — the viewer bundle is
independent of Quartz's Preact). Everything upstream is untouched: the
build-time rewriter, the embedded `{canvas, attachments, noteLinks}` payload,
the loader script, and the `mountCanvasView(container, payload)` /
`setTheme` / `dispose` contract.

Structure (the new isolation boundary is the whole `viewer/` directory):

- `canvasToFlow.js` — PURE JSON Canvas -> React Flow conversion (positions,
  z-order, preset/hex colors, `fromSide`/`toSide` -> handles with geometric
  inference when absent, `fromEnd`/`toEnd` arrow markers). Node-testable.
- `flowNodes.jsx` — custom nodes: text (prebaked HTML), note (fragment fetch +
  open-note header), media (img/audio/video/plaintext via `MediaKind`), link
  (sandboxed iframe), group. The two-click model is a `click-guard` overlay
  that lifts on selection.
- `canvasApp.jsx` — read-only ReactFlow (uncontrolled `defaultNodes` — required
  for click-selection to apply), minimap, controls + fullscreen button,
  mistouch wheel gate, 0.05x–20x zoom parity.
- `canvasView.jsx` — mount/dispose, theme (`saved-theme` + `themechange`),
  fullscreen retention across SPA nav (unchanged `fullscreenRetention.js`).
  CSS (React Flow base + ours) is bundled as text and rendered inside the
  mount, so Quartz SPA DOM swaps cannot strip it.

## Consequences

- **Fidelity gains over hesprs:** edge `fromEnd`/`toEnd:"none"` honored; edge
  labels are DOM text (searchable/accessible); maintained ecosystem.
- **Bundle cost:** 64.7 KB -> ~397 KB min (React + React Flow). Still
  self-hosted, still dynamic-imported on canvas pages only.
- `json-canvas-viewer` dependency removed; `@xyflow/react`, `react`,
  `react-dom` added. `MediaKind` extension lists in `canvasSchema.js` are the
  single source of truth for what the viewer renders natively.
- Group `background` images remain an accepted cosmetic gap.
- Browser-facing selectors changed (`.react-flow__node[data-id=...]` instead of
  `.JCV-*`); e2e lives in `scripts/e2e-canvas-flow.mjs` + `scripts/e2e-smoke.mjs`
  over the shared `scripts/lib/e2eHarness.mjs`.

## Amendments

- 2026-07-11 (ticket `docs-internal/tickets/full-screen-mode.md`): the canvas-local
  fullscreen control and `fullscreenRetention.js` were REMOVED. Fullscreen is
  now the site-wide `full-screen-mode` toolbar plugin, which fullscreens
  `<html>` — an element the SPA router never swaps, so fullscreen survives
  navigation without retention machinery.
- 2026-07-11, later (same ticket, owner direction): the canvas control and
  `fullscreenRetention.js` were REINSTATED as the INNER of two fullscreen
  levels — it fullscreens the mount and nests on top of the site-wide level
  (Fullscreen API stack). The site-wide plugin keys its state on
  `documentElement.matches(":fullscreen")` so the levels stay independent.
