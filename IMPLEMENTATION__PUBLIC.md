# Phase 2 Implementation — Public Summary

See `docs/status/phase-2.md` for the full status (what was built, exact
verification commands, parity-checklist closure, decisions, open questions).
Highlights:

- `canvas-plugin/` delivered: our own Quartz pageType+emitter plugin
  (ADR 0001) with build-time canvas rewriting (text-card markdown, note
  fragments with `#heading`/`#^block` subpaths, navigable canvas/PDF cards,
  privacy placeholders) and the isolated hesprs `CanvasView` bundle
  (renderer isolation rule, plan §4.3).
- One shared resolver: canvas-side links resolve through
  `@quartz-community/utils` pinned to Quartz's own lockfile commit —
  byte-identical to markdown resolution. `[[x.canvas]]` from markdown
  resolves; canvases appear in backlinks/graph/search.
- Engine: canvas publish rule = folder opt-in (frontmatter is N/A for canvas
  JSON); the privacy placeholder never carries the vault path; staging
  exclusion remains the enforcement mechanism.
- Tests green under Node v26 via nvm: 126 unit + 30 integration (`npm test`),
  22/22 e2e smoke incl. headless Chromium (`npm run test:e2e`).

(Phase 1 summary: `docs/status/phase-1.md` / git history of this file.)
