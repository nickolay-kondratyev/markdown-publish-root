# Status: plan/folder-nav-over-id-urls.md

**PLAN COMPLETE (2026-07-10).** All phases 0–5 done; definition of done met:
folder-shaped explorer (collapse-only folders, title labels, `/n/<docid>`
hrefs), breadcrumbs on nested note + canvas pages, move-stability and
folder-privacy tests passing, no folder-listing pages, unit + integration +
e2e green, vendor/quartz tracked diff empty, docs + ADR 0004 updated.

## Phase 0 — Spike C (DONE, 2026-07-10)

Local `component`-category plugin proven end-to-end against the vendored
Quartz pin — mount, naming rule, options flow, `not-index` condition,
css+script shipping. Full findings: `docs/spikes/spike-C-local-component-plugin.md`.
No fork needed; plan proceeds as written. No deviations.

## Phase 1 — Staging injection + validation (DONE, 2026-07-10)

- `vintrinPath` (reserved key, `engine/src/frontmatter.ts`) is now injected
  into every staged doc: md frontmatter via `MarkdownStagingTransformer`
  (required option), canvas `metadata.frontmatter` via
  `CanvasStagingTransformer`. Root `index.md` gets `vintrinPath: index.md`.
- Reserved-key collision: a PUBLISHABLE doc declaring `vintrinPath` fails the
  build in VaultStager pass 2 with `ReservedFrontmatterKeyError`, listing
  every offender (md + canvas), before anything is written. Unpublished docs
  are exempt (consistent with id validation scope).
- Tests first (red→green): exact-output md injection asserts updated to the
  new spec, canvas + stager + collision + root-index coverage added.
  297 unit / 43 integration / typecheck green.
- Deviations: none.

## Phase 2 — vintrin-explorer (DONE, 2026-07-10)

- New local component plugin `vintrin-explorer/`: pure `VaultTreeBuilder`
  (11 unit tests: nesting, title labels, canvas leaves, root-index + no-path
  exclusion, stock sort order) + server-side rendered component with stock
  DOM classes, ported styles, and the stock inline script minus fetch/trie
  (SPA body-swap delivers per-page active/open state; script does collapse
  persistence, mobile toggle, scroll restore).
- Config generator: stock `explorer` off, `vintrin-explorer` local source on
  (left, priority 50). `LocalPluginDirs` object replaces the positional
  canvasPluginDir param.
- Verified hands-on in a real build: folder-shaped tree with title labels and
  `n/<docid>` hrefs on every page, active link + open ancestor server-side.
- **Deviation (sequencing only):** `folder-page` stays ENABLED until Phase 3 —
  stock breadcrumbs still links its "n" crumb to the `/n/` listing; disabling
  folder-page alone broke the link-checker (caught by integration tests).
  Both flip together with vintrin-breadcrumbs. End state per plan unchanged.
- Note: canvases appear in the tree only after the Phase 3 canvas-plugin
  passthrough (§4.4) — their virtual pages don't carry vintrinPath yet.
- 310 unit / 43 integration / typecheck green.

## Phase 3 — vintrin-breadcrumbs + canvas passthrough + config flips (DONE, 2026-07-10)

- New local component plugin `vintrin-breadcrumbs/`: pure `CrumbTrailBuilder`
  (7 unit tests: nested, root-level, canvas, no-vintrinPath→nothing,
  showCurrentPage, title fallback, rootName) + component rendering
  `Home` (linked) ❯ folder segments (plain text) ❯ title (unlinked).
  Never touches `ctx.trie`.
- Canvas-plugin §4.4 passthrough: virtual-page frontmatter now carries
  vintrinPath (new generate() unit test) — canvases appear in the explorer
  tree and get folder crumbs.
- Config: stock `breadcrumbs` off, `vintrin-breadcrumbs` on
  (beforeBody/5/not-index); `folder-page` off + `byPageType.folder` dropped
  (deferred from Phase 2 — see its deviation note).
- Verified hands-on: note + canvas crumb trails correct, home page has no
  crumbs, `/n/index.html` no longer emitted, explorer shows `canvases/`.
- 323 unit / 43 integration / typecheck green. No deviations.

## Phase 4 — Integration + product verification (DONE, 2026-07-10)

- Fixtures: `notes/guides/deep-dive.md` (nested, id-stamped) and
  `notes/vintrin-priv-only-x7q3/only-private.md` (publish:false; the folder
  NAME is a leak sentinel). test-vault README updated.
- New `engine/test/integration/folderNav.test.ts` (9 tests): nested explorer
  structure, title labels, every explorer href resolves to the docid grammar,
  folder rows contain no links, note + canvas crumb trails, only Home linked,
  folder-privacy sentinel absent from ALL output, no `/n/` listing.
- Move-stability added to renameStability.test.ts: moving
  notes/getting-started.md → notes/guides/ leaves the emitted file set and
  every resolved link identical while crumbs change (with control assert).
- e2e promoted to a permanent script `scripts/e2e-foldernav.mjs` (wired into
  `npm run test:e2e`): desktop expand→click→/n/<docid>, crumbs on note +
  canvas, collapse state across SPA nav, mobile hamburger — 14/14 in real
  Chromium (screenshots `.out/qa-foldernav/`, not source-controlled).
- **Called out:** e2e-smoke's dir-redirect check used `/n` as its fixture
  URL; that listing is now intentionally gone, so the check moved to `/tags`
  and a new check asserts `/n` 404s. Server routing behavior unchanged.
- vendor/quartz tracked diff empty (no fork/patch).
- 323 unit / 56 integration / 38 smoke / 14 folder-nav e2e green.

## Phase 5 — Docs + ADR (DONE, 2026-07-10)

- ADR `docs/decisions/0004-folder-nav-local-component-plugins.md`.
- READMEs: new `vintrin-explorer/`, `vintrin-breadcrumbs/`; updated
  `engine/README.md` (vintrinPath injection + folder-nav section),
  `canvas-plugin/README.md` (passthrough), `docs/current/dev.md`
  (modules, design points, test counts).
- Plans cross-linked: folder-nav plan marked DONE;
  id-based-publishing §8.3 marked DONE.

## Environment note (this workstation)

No nvm on this box (`~/.nvm` absent) and the profile's `node()`/`npm()` shell
functions recurse infinitely when nvm is missing — bypass with `unset -f node
npm npx` and a standalone Node 25 at `~/.local/node25/node-v25.1.0-linux-x64/bin`
prepended to PATH. Follow-up: fix the guard in vintrin-env profile scripts.
