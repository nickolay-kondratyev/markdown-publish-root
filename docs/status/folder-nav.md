# Status: plan/folder-nav-over-id-urls.md

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

## Environment note (this workstation)

No nvm on this box (`~/.nvm` absent) and the profile's `node()`/`npm()` shell
functions recurse infinitely when nvm is missing — bypass with `unset -f node
npm npx` and a standalone Node 25 at `~/.local/node25/node-v25.1.0-linux-x64/bin`
prepended to PATH. Follow-up: fix the guard in vintrin-env profile scripts.
