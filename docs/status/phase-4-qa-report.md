# Phase 4 QA Report: Definition-of-Done behavioral verification

**Verdict: APPROVED FOR RELEASE — DoD met.** 38/38 behavioral checks pass.
Hands-on QA of the built static site in real Chromium (desktop 1400x900 +
mobile 390x844), walking every item of plan/main.md §5 "Definition of done"
and the canvas capability parity checklist. No DoD-blocking failures, no
regressions, no privacy leaks. Three minor polish observations recorded below
(none blocking).

## Test environment

- Build: `node cli/bin/publish.mjs build test-vault --config <site.json> --out .tmp/qa-public`
  (site.json: `{title, baseUrl, publishFilter: {includeFolders: ["canvases"]}}`),
  Node v26.4.0 via nvm. Build exit 0; reported 3 pages, 2 canvases, 1 asset,
  2 filtered; validation pass: no leaks, exactly the 1 deliberate broken link.
- Served with the documented extensionless -> `.html` hosting mapping
  (cli/README.md "CloudFront prerequisites"); plain `python3 -m http.server`
  cannot express that mapping, so a minimal static server mirroring
  `scripts/e2e-smoke.mjs` was used.
- Browser: system Chromium via playwright-core (same launch recipe as e2e
  smoke). Date: 2026-07-08.
- Driver + raw results: `.tmp/qa-phase4.mjs`, `.tmp/qa-results.json`,
  `.tmp/qa-console-log.json` (not source-controlled).
- Screenshots: `.out/qa-phase4/*.png` (not source-controlled, per repo rule).

## Charter checklist

| # | Item | Status | Evidence (`.out/qa-phase4/`) |
|---|------|--------|------------------------------|
| 1 | Index renders; wikilinks navigate on click | PASS | 01-index.png, 02-note-getting-started.png |
| 2 | Main canvas: markdown text cards, group label, preset+hex colors, labeled/arrowed edges, minimap, pan (drag), zoom (wheel) | PASS | 03-canvas-main-initial.png, 04-canvas-main-after-pan-zoom.png |
| 3 | Two-step card UX: first click selects (no nav, `JCV-active`), wikilink in active card navigates; wheel over active card does NOT pan/zoom the canvas | PASS | 05-canvas-card-selected.png, 06-note-via-card-wikilink.png |
| 4 | Note card: full architecture.md content in card; open-note header affordance navigates to note page | PASS | 07-note-architecture-via-open-affordance.png |
| 5 | Subpath card shows ONLY `#Installation` (header "Getting Started > Installation"; Usage/Advanced absent) | PASS | 03-canvas-main-initial.png |
| 6 | Image card shows diagram.png (loaded, naturalWidth 320) | PASS | 03-canvas-main-initial.png |
| 7 | Private card = contentless unlinked "Private note" placeholder; `LEAK-SENTINEL-9f3a72` grep over ENTIRE output dir: 0 hits; no private content anywhere | PASS | 03-canvas-main-initial.png + grep |
| 8 | Canvas->canvas: styled card navigates to second canvas; back card returns; `[[main.canvas]]` wikilink in second's text card works | PASS | 08-canvas-second.png |
| 9 | Link card: jsoncanvas.org in iframe with `sandbox="allow-scripts allow-same-origin"` (rendered live when network available) | PASS | 08/12/16 screenshots |
| 10 | Note->canvas wikilink navigates; backlinks on notes list both canvases; graph on note pages renders with both canvases in the node data; search "hex color" (canvas-card text) returns the main canvas | PASS | 09-note-architecture-full.png, 10-note-graph-sidebar.png, 11-search-canvas-text.png |
| 11 | Theme: toggle on note page -> canvas page loads dark (`--background rgb(30,30,30)`); toggle ON canvas page -> viewer updates live | PASS | 12/13/14 theme screenshots |
| 12 | Mobile 390x844: canvas usable (mounts 0.9–2.2 s localhost, all 8 overlays, no page overflow); note pages not horizontally scrollable; viewer bundle 64.4 KB; whole site 632 KB | PASS | 16-mobile-canvas-main.png, 17-mobile-note.png |
| 13 | Console: zero own-origin console/page errors across every page visited (external CDN/iframe noise excluded, same policy as e2e smoke) | PASS | .tmp/qa-console-log.json |
| 14 | Private note URL 404s (both `/notes/private-secret` and `.html`); 404 page copy is privacy-preserving ("private or doesn't exist") | PASS | 15-private-404.png |

## Verification notes worth keeping

- **Group + edge labels are drawn on the 2D canvas** (viewer `drawEdgeLabel`),
  so they have no DOM text — asserting them requires screenshots, not
  `textContent`. Visually confirmed: "Intro Group" pill, "embeds note",
  "only #Installation", "go to second canvas", "back to main".
- **Cards sit under a `JCV-click-layer`**, so automation must click raw
  screen coordinates (Playwright locator clicks time out on hit-target
  checks). Real-user behavior is unaffected.
- **Two clicks navigate from file cards**: the open-note affordance and
  canvas-card links need click-to-select first, then click-to-follow. This
  matches the documented interaction model (canvasView.js, plan §2.2 caveat).
- The only broken link in the build is index.md -> `[[private-secret]]` —
  deliberate fixture behavior, already documented (phase-3 finding 1). The
  string "private-secret" in index.html/contentIndex.json is index.md's own
  authored text + dead href, not leaked content.
- Mobile note pages report a 16 px `scrollWidth` delta caused by the
  off-canvas Explorer drawer, but nothing extends past the right edge and the
  user cannot actually scroll horizontally (scrollX stays 0) — no user impact.

## Issues found

### Blocking
None.

### Major
None.

### Minor (polish, post-MVP)
1. **Search preview of a canvas page is empty.** Search FINDS canvases by
   card text (good), but the preview pane shows only the title — canvas
   bodies are client-mounted, so the static preview has nothing to show
   (11-search-canvas-text.png). Related to plan §7.5 (SSR/prerender).
2. **File-card navigation needs two clicks** with no visual hint that the
   first click armed the card. Consider a hover/selected affordance cue on
   the open-note header. (Interaction model itself is per design.)
3. **Link card offline/blocked-embed state is a blank white card** (external
   sites that fail to load, e.g. frame-blocking hosts, show nothing).
   Graceful fallback (favicon + URL) would be nicer. hesprs-native behavior.

### Already-documented accepted gaps (re-confirmed, NOT new)
- Edge `toEnd: "none"` / `fromEnd` and group background images — cosmetic
  hesprs gaps (phase-2).
- Deliberate index -> private-secret dead link (phase-3).

## Definition-of-done closure (plan §5)

Every sentence of the DoD was exercised in-browser and passed: one-command
build; both canvases interactive; parity checklist cards all render; open
affordance, canvas-card, and wikilink navigation (both directions, including
`[[x.canvas]]` from markdown) all work by real clicks; private note is a
placeholder with zero content leakage and a 404 URL; both canvases appear in
graph view, backlinks, and search; theme is consistent and live; mobile load
is sub-3-seconds on localhost with a 64.4 KB viewer bundle and 632 KB total
site. S3/CloudFront deploy remains the optional bonus (dry-run verified in
phase 3; no AWS credentials in this sandbox by design).
