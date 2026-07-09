# Phase 0 Status: Spikes

**Result: all three spikes complete. GO for plugin-shaped integration.**

## What was built

- `docs/spikes/spike-A-quartz-plugin-api.md` — Quartz 5 plugin API proven
  hands-on: local pageType plugin claimed a dummy extension, emitted an HTML
  page with inline script, registered links (backlinks + graph + wikilink
  resolution). Spike C recipe included (`transformLink`/`slugifyFilePath` from
  `@quartz-community/utils`).
- `docs/spikes/spike-B-hesprs-viewer.md` — hesprs viewer surface verified from
  source + headless smoke test (21/21). Self-hosted esbuild bundle proven
  (129.7 KB min / 40.5 KB gz).
- `test-vault/` — fixture vault exercising the full parity checklist.
- `docs/decisions/0001-own-pagetype-plugin-with-hesprs-viewer.md`.

## Deviations from plan/main.md (reality wins)

1. **Official canvas-page plugin exists** (plan assumed no Quartz canvas
   support). Decision: build our own pageType plugin with hesprs; disable the
   official one (ADR 0001, approved by Nickolay).
2. **Quartz 5 is NOT published to npm** (`@jackyzha0/quartz` 404s). Engine will
   manage a pinned Quartz checkout instead of an npm dependency.
3. **Quartz 5 requires Node >= 22** (engine-strict). Dev env default is v20;
   builds must run under nvm-provided >= 22.
4. **hesprs `subpath`/PDF/canvas-in-canvas gaps** confirmed — handled at build
   time (ADR 0001 consequences), matching plan §5's anticipated fallbacks.

## Key mechanics for later phases

- Build: `npx quartz build -d <vault> -o <out>`; one-time
  `npx quartz plugin install` bootstrap after checkout.
- Local plugins: `source: ./local-plugins/<name>` in `quartz.config.yaml`;
  must be plain-Node-importable ESM.
- GOTCHA: Quartz's content glob honors `.gitignore` — never stage the vault
  under a gitignored dir (e.g. `.tmp/`) or the build sees 0 files.
- Theme: localStorage `"theme"`, `saved-theme` attr on `<html>`,
  `themechange` CustomEvent.
- hesprs `attachments` mutates node.file in place (pass a clone); parser may
  be async; missing attachment entries render fetch-404 bodies (must pre-check).

## Open questions carried forward

- Exact Quartz pin/vendor mechanism (git clone pinned to a commit vs subtree) —
  Phase 1 decides, documented as ADR.
