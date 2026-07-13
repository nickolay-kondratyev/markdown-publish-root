# Phase 2 Status: Canvas integration

**Result: complete.** `.canvas` files build into interactive pages through our
own Quartz pageType+emitter plugin (`canvas-plugin/`, ADR 0001) with all
rendering decisions made at build time. Suite green: **126 unit + 30
integration** (`npm test`) plus a **22/22 e2e smoke** incl. headless-Chromium
viewer verification (`npm run test:e2e`). Typecheck clean.

## What was built

- `canvas-plugin/` — dual-category Quartz plugin (pageType claims `.canvas`,
  emitter writes fragments + viewer bundle), plus renderer-agnostic build-time
  modules: shared resolver (`@quartz-community/utils` pinned to Quartz's own
  lockfile commit + crawl-links' canonicalization recipe), text-card markdown
  pipeline (unified/remark/rehype, wikilinks through the shared resolver),
  note-fragment extractor (Quartz transclude semantics: `data.blocks` for
  `#^block`, github-slugged heading slice for `#heading`, link rebasing via
  Quartz's `normalizeHastElement`), and the canvas rewriter (see README table).
- `canvas-plugin/viewer/canvasView.js` — the ONLY hesprs importer (plan §4.3);
  esbuild self-hosted bundle (~64 KB min, no CDN; marked/dompurify tree-shake
  out because prebaked HTML needs no client parser). Theme wired to Quartz's
  `saved-theme`/`themechange`; open-note header affordance on note cards; SPA
  `nav`/`render` mount + `addCleanup` disposal.
- Engine wiring: canvas publish rule (folder opt-in, default deny — canvases
  are content without frontmatter), `stagedCanvasFiles` in StagingResult,
  generated config registers the local plugin (official `canvas-page` stays
  disabled), `byPageType.canvas` layout, viewer-bundle preflight in
  SiteBuilder, CLI reports canvas counts.
- `scripts/build-canvas-viewer.mjs` (wired into `npm run setup`),
  `scripts/e2e-smoke.mjs` (`npm run test:e2e`).

## Verification (Node v26 via nvm)

```bash
source ~/.nvm/nvm.sh && nvm use 26
npm run typecheck        # clean
npm run test:unit        # 126 pass / 0 fail
npm run test:integration # 30 pass / 0 fail (two full builds of test-vault)
npm run test:e2e         # 22/22 (curl-level + headless Chromium; screenshot .out/phase-2-canvas-smoke.png)
```

## Parity checklist closure (plan §5 / Spike B gap list)

| Item | Status |
|---|---|
| Text cards, full markdown | DONE — build-time HTML, wikilinks resolved (e2e-verified in-browser) |
| Note cards incl. `#heading`/`#^block` subpath | DONE — fragments sliced from processed hast at build time (Spike B gap CLOSED); unknown subpath falls back to full note + warning |
| Media cards (image/audio/video) | DONE — attachments map to emitted assets; `object-fit: contain` override matches Obsidian |
| PDF cards | DONE per MVP fallback — navigable link card to the published PDF (gap CLOSED as planned) |
| Canvas->canvas cards | DONE — navigable styled card (inline preview stays a follow-up, plan §4.2) |
| Link cards (sandboxed iframe) | DONE (hesprs native; e2e shows jsoncanvas.org rendering) |
| Groups, edges (labels/colors), 6 presets + hex, pan/zoom, minimap, light/dark | DONE (hesprs native + themechange wiring) |
| Edge `toEnd:none`/`fromEnd`, group background images | ACCEPTED cosmetic gaps for MVP (Spike B severity low; upstream-PR candidates) |
| Wikilinks anywhere -> notes AND canvases | DONE — one shared resolver; `[[x.canvas]]` from markdown resolves to the canvas page |
| Canvases in graph + backlinks + search | DONE — `data.links` + `data.text` on virtual pages |
| Privacy rule (plan §4.4) | DONE — placeholder card, vault path removed, sentinel + path leak integration-tested |
| Node ids/coordinates preserved | DONE — unit + integration tested |

## Decisions / deviations (and why)

1. **Text cards render through our own unified/remark/rehype pipeline** (the
   family Quartz uses), not Quartz's full transformer chain — Quartz has no
   library API for its chain (spike A §3) and text cards are small; wikilink
   RESOLUTION still goes through Quartz's own utils (the part that must never
   fork). Note cards DO reuse Quartz's full chain via processed-hast slicing.
   Raw HTML in text cards passes through, matching Quartz's ofm trust model.
2. **Canvas publish semantics:** published iff under `includeFolders` (after
   hidden/exclude rules). Content-bearing files stay opt-in like markdown;
   frontmatter is N/A for canvas JSON. Documented in engine/README.md.
3. **Private vs missing indistinguishable by design:** the plugin only sees
   the staging dir, so one "Private note" label serves both — deliberately no
   existence oracle for unpublished files.
4. **Block-ref anchors github-slugged** (`#^engine-def` -> `#engine-def`):
   Quartz's `transformLink` slugs ALL anchors; canvas hrefs match markdown
   hrefs byte-for-byte (and emitted pages carry `id="engine-def"`).
5. **frame: "default"**, not "full-width" — the full-width core frame drops
   the sidebars, losing graph/backlinks on canvas pages (plan §4.1
   differentiator). Canvas pans/zooms, so content width is not a problem.
6. **Integration tests serialized** (`--test-concurrency=1`): concurrent
   builds against ONE vendored checkout race on `quartz.config.yaml` +
   `.quartz-cache` (observed corruption). One-build-per-checkout documented as
   an engine contract (matters for the hosted service).
7. **No new ADR:** no deviation from ADR 0001/0002's architecture; per-module
   decisions live in the READMEs and this note.

## Empirical findings

- Preact vnodes from our plugin's copy render fine through Quartz's bundled
  renderer (spike A finding re-confirmed with the real plugin).
- hesprs media-kind dispatch regexes copied from v4.3.2 source into
  `classifyFileTarget` so build-time decisions match viewer behavior exactly.
- E2E headless run: the only console error on canvas pages comes from INSIDE
  the link-card's sandboxed iframe (jsoncanvas.org's own script failing to
  reach its Prism CDN offline) — third-party, filtered by origin in the smoke.
- Browser testing DONE here at smoke level (mount, overlays, fragments,
  subpath, placeholder, theme reaction, no own-origin errors). Deeper UX
  testing (interactions, mobile, long content) remains for Phase 4 QA.

## Open questions carried forward

- Edge arrow endpoints (`toEnd: "none"`, `fromEnd`) and group background
  images: cosmetic hesprs gaps — upstream PR vs accept (revisit at dogfood).
- Search indexes text-card content only; embedded note-card content is already
  indexed via the notes themselves. Good enough for MVP?
- `![[embed]]` inside text cards degrades to a link (image embeds DO render);
  full transclusion in cards is plan §7.6 follow-up.
- Viewer initial theme uses `saved-theme`/`prefers-color-scheme`; verified
  reactive via `themechange`. Phase 4 should eyeball both themes on real
  content.
