# Plan: Folder-Based Navigation UI over Stable-Id URLs

**Status:** DONE (2026-07-10) — executed phases 0–5; status log `docs/status/folder-nav.md`, decision record `docs/decisions/0004-folder-nav-local-component-plugins.md`.
**Predecessor:** `plan/id-based-publishing.md` (DONE) — this plan executes its follow-up #3 (§8): "Title/metadata-driven Explorer & breadcrumbs (flattening mitigation)".
**Owner:** Nickolay

## 1. Goal

Links stay stable (`/n/<docid>`), the UI becomes folder-shaped again:

- **Explorer** shows the ORIGINAL vault folder hierarchy (folders + title-labeled docs), not the flat `n/` slug tree.
- **Breadcrumbs** show `Home ❯ <folder> ❯ … ❯ <title>` from the original vault path, on note AND canvas pages.
- Every doc link everywhere remains `/n/<docid>` / `/n/<docid>.canvas`. Renaming/moving a doc never changes its URL — it only updates where it appears in the tree/crumbs.

**No Quartz fork, no patching.** Everything rides the two extension surfaces we already own: the engine's staging pass and Quartz 5's local-plugin loader (same mechanism as `canvas-plugin/`).

## 2. Locked decisions (aligned with Nickolay, 2026-07-10)

| Decision | Value |
|---|---|
| Folder click behavior | **Collapse-only.** Folders have no docids → no folder URLs at all. Explorer folders expand/collapse; breadcrumb folder segments are plain text (only the root "Home" crumb and the current-page crumb chain link). Matches Obsidian Publish. |
| `folder-page` plugin | **Disabled** (config flip). Its only current output is a meaningless flat listing at `/n/`; with collapse-only folders it has no product role. |
| Hierarchy data channel | Staging injects reserved frontmatter key **`vintrinPath`** = original vault-relative path incl. extension (e.g. `notes/projects/foo.md`). md: frontmatter; canvas: `metadata.frontmatter.vintrinPath`. |
| Reserved-key collision | Vault doc already declaring `vintrinPath` → **hard fail the build at staging**, listing every offending file (mirrors docid validation). |
| Implementation shape | Two **local** Quartz plugins at repo root, `vintrin-explorer/` and `vintrin-breadcrumbs/` (category `component`), mirroring stock plugin granularity 1:1. Stock `explorer` + `breadcrumbs` flipped to `enabled: false` in the generated config. |
| Tree render locus | **Server-side** from `QuartzComponentProps.allFiles` (which includes canvas virtual pages). No client fetch, no contentIndex dependency. Thin inline script only for collapse/toggle/active-state. |
| Sort order | Folders first, then natural case-insensitive alpha by display name (stock default). Not configurable now. |

## 3. Feasibility basis (verified hands-on in the vendored pin, 2026-07-10)

All file refs relative to `vendor/quartz` at pinned commit `9cf87ff` unless noted.

1. **Why it flattens today:** stock Explorer builds its trie client-side from `file.slug.split("/")` (`.quartz/plugins/explorer/src/components/scripts/explorer.inline.ts:62-64`); stock Breadcrumbs builds a slug trie server-side (`.quartz/plugins/breadcrumbs/src/components/Breadcrumbs.tsx:50-60`). Their `mapFn`/`sortFn`/`filterFn` options run AFTER trie shape is fixed — configuration cannot restructure. Replacement is the only non-fork path, and it is supported:
2. **`component` is a plugin category** — stock explorer/breadcrumbs are themselves community plugins with `"category": "component"` + a `components` manifest map (their `package.json`). The loader's component path is source-agnostic; local paths are symlinked exactly like `canvas-plugin` (`quartz/plugins/loader/config-loader.ts:315-400`, spike A G5).
3. **Layout wiring:** per-plugin YAML `layout: {position, priority, condition, display}` → `buildLayoutForEntries` (`config-loader.ts:730-813`) looks up the component in the registry by plugin name or **PascalCase(plugin-dir-name)** and mounts it; `entry.options` flow into the component constructor (`config-loader.ts:783-789`). Naming rule we adopt: dir `vintrin-explorer` → component export key `VintrinExplorer` (Phase 0 proves the exact lookup).
4. **Data availability:** components receive `allFiles` (every page's data incl. frontmatter) server-side (`@quartz-community/types` → `QuartzComponentProps`), and virtual pages are merged in before render (`quartz/plugins/pageTypes/dispatcher.ts:206`) — so canvases appear in the tree.
5. **Frontmatter passthrough:** the enabled `note-properties` transformer (order 5) assigns the FULL parsed frontmatter object: `file.data.frontmatter = data` (`.quartz/plugins/note-properties/src/transformer.ts:248`) — arbitrary keys like `vintrinPath` survive.
6. **Canvas metadata survives:** `parseCanvas` preserves top-level `metadata` (`canvas-plugin/src/canvasSchema.js:19-45`); our plugin already reads the engine-injected `metadata.frontmatter.title` (`canvas-plugin/index.js:114`).

## 4. Specification

### 4.1 Staging: inject `vintrinPath`

- `MarkdownStagingTransformer.transform` gains a required `vintrinPath` option; injected into the frontmatter region unconditionally (same insertion mechanics as `title`, JSON-stringified scalar).
- `CanvasStagingTransformer.transform` sets `metadata.frontmatter.vintrinPath`.
- Validation (before any staging write, alongside id validation): a vault doc whose OWN frontmatter / canvas metadata already contains `vintrinPath` → build error listing all offenders. New error type or extension of the existing validation error — keep one validation surface in `VaultStager` pass 2.
- Root `index.md` gets `vintrinPath: index.md` like any other doc (consumers special-case it, not staging).

### 4.2 `vintrin-explorer/` (local plugin, category `component`)

- **Tree building (pure, unit-testable module):** input = `allFiles`; take every file with `frontmatter.vintrinPath`; split path into folder segments + leaf; leaf label = `frontmatter.title`; folder label = raw segment; leaf href = its slug (`n/<docid>` / `n/<docid>.canvas`), resolved via `@quartz-community/utils` path helpers (never reimplement slug/URL logic). Excluded from tree: root `index.md` (it is "Home"), anything without `vintrinPath` (tag pages, 404). Folders that contain only unpublished docs can never appear — the tree derives ONLY from staged (published) docs.
- **Render:** server-side nested `<ul>` mirroring stock DOM classes (`explorer`, `folder-container`, `folder-outer`, …) so stock-equivalent SCSS applies with minimal edits.
- **Inline script (adapted from stock, minus fetch/trie):** folder collapse toggles + localStorage persistence (`fileTree` key, keyed by original folder path), mobile toggle, scroll restore, and on `nav`/`render` events: mark active link (`href` vs current slug) + expand its ancestor folders.
- **Folders are collapse-only:** no `<a>` for folders ever (stock `folderClickBehavior: "link"` machinery is dropped, not just configured off).

### 4.3 `vintrin-breadcrumbs/` (local plugin, category `component`)

- Reads `fileData.frontmatter.vintrinPath`. Crumbs: `Home` (links `/`) ❯ folder segments (plain text) ❯ current title (no link). Options mirror stock where meaningful (`spacerSymbol`, `rootName`, `showCurrentPage`).
- No `vintrinPath` (tag pages, 404) → render nothing. Home page excluded via existing `condition: "not-index"` layout wrapper.
- Must NOT touch `ctx.trie` (stock breadcrumbs/dispatcher cache a slug trie there — `Breadcrumbs.tsx:50`, `dispatcher.ts:171`); we derive crumbs from `fileData` alone.

### 4.4 `canvas-plugin` touchpoint (ours)

`generate()` passes the injected path through into virtual-page data: `frontmatter: { title, tags: [], vintrinPath: canvas.metadata?.frontmatter?.vintrinPath }` (`canvas-plugin/index.js:43`). That single line makes both new components work for canvases.

### 4.5 Engine config (`quartzConfigGenerator.ts`)

- `explorer` → `enabled: false`; `breadcrumbs` → `enabled: false`; `folder-page` → `enabled: false`; drop the `byPageType.folder` layout entry.
- Add local sources (absolute dirs, like `canvasPluginDir`):
  - `vintrin-explorer` with `layout: { position: "left", priority: 50 }`
  - `vintrin-breadcrumbs` with `layout: { position: "beforeBody", priority: 5, condition: "not-index" }`
- Local plugin dirs need the same symlink-registration path canvas-plugin uses — no publish, no build step; plain-Node-importable ESM (spike A G5/G6).

### 4.6 Explicitly unchanged

Graph, backlinks, search (link/title driven — already correct), URL shape, hosting contract, privacy staging model, CLI/deploy.

## 5. Consequences (accepted)

1. **Published pages reveal the doc's original folder path** (in tree + crumbs + frontmatter of staged copy). This is the product intent — folder UX *is* path disclosure. Only paths of published docs appear; private-only folders never do (asserted by test).
2. **Full tree HTML is baked into every page.** Fine at current scale; if a vault ever makes this heavy, the same plugin can switch to an emitter-generated JSON + client render — still fork-free (follow-up, not now).
3. **Tag pages lose breadcrumbs** (they had slug-crumbs before). Acceptable; revisit if tags become a first-class surface.
4. **Moving a doc changes its tree/crumb location but not its URL** — exactly the contract we want; the rename-stability test extends to assert both halves.

## 6. Phased execution

**Phase 0 — Spike: local `component` plugin end-to-end (timebox: short).**
Register a hello-world local component plugin via the generated config; prove: it renders in the left sidebar, registry lookup naming rule (dir name vs PascalCase component key), `entry.options` reach the constructor, `condition: "not-index"` wrapper applies, and inline `afterDOMLoaded` script ships. This is the ONLY mechanism spike A did not already prove. Record findings in `docs/spikes/`. If the loader cannot mount a local component plugin → STOP, escalate (fork decision returns to the table).

**Phase 1 — Staging injection + validation.**
Failing tests first: md injection, canvas injection, reserved-key collision hard-fail (md + canvas, all offenders listed), root-index path. Implement in `MarkdownStagingTransformer` / `CanvasStagingTransformer` / `VaultStager` pass 2.

**Phase 2 — `vintrin-explorer`.**
Pure tree-builder module with unit tests (nesting, titles as labels, canvas leaves, root-index exclusion, no-`vintrinPath` exclusion, sort order). Component + SCSS + inline script. Config generator flip (`explorer` off, local source on) + generator unit-test updates.

**Phase 3 — `vintrin-breadcrumbs`.**
Unit tests: nested note, root-level note, canvas page, no-`vintrinPath` → null. Component + config flip. Canvas-plugin passthrough (§4.4) with test.

**Phase 4 — Integration + product verification (stamped `test-vault`).**
- Build green; explorer HTML contains the nested original folder structure; every doc href in it matches `^/n/docid_[0-9a-z]{21}_e(\.canvas)?$`.
- Breadcrumbs correct on a nested note page and a canvas page.
- **Move-stability:** move a fixture note to another folder → URL and resolved hrefs identical; explorer/crumbs reflect the new folder.
- **Privacy:** a folder containing only unpublished docs does not appear anywhere in output (leak-sentinel folder name in test-vault).
- No `/n/` folder-listing page emitted; no dangling folder hrefs anywhere in output.
- e2e (`/verify` harness): expand folder → click note → lands on `/n/<docid>`; crumbs visible; collapse state survives SPA nav; mobile explorer toggle works.

**Phase 5 — Docs.**
`engine/README.md` (staging now injects `vintrinPath`), `canvas-plugin/README.md`, new plugin READMEs, `docs/current/dev.md`, short ADR (`docs/decisions/`): folder-UI-via-local-component-plugins, collapse-only folders, no-fork rationale. Cross-link from `plan/id-based-publishing.md` §8.3.

Each phase ends with a short written status per working agreements; commit at phase milestones.

## 7. Out of scope / follow-up tickets

1. Folder listing pages (would need a URL scheme for id-less folders — rejected for now, see §2).
2. Emitter-generated tree JSON + client render (only if tree HTML weight ever matters).
3. Explorer sort/filter configurability via `site.json`.
4. Breadcrumbs for tag pages.
5. Upstreaming a `frontmatter-path-driven tree` option to the community explorer plugin (would let us delete `vintrin-explorer` later).

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Component-registry lookup rejects local plugin naming | Medium | Phase 0 spike is exactly this; hard STOP + escalate if it fails |
| Stock explorer SCSS/DOM drift makes copied styles diverge on Quartz pin bumps | Low | We pin Quartz; styles live in OUR plugin; re-verify on deliberate bumps (same policy as resolver invariant) |
| `ctx.trie` slug-trie cache interferes (dispatcher/breadcrumbs) | Low | Our components never read/write `ctx.trie` (§4.3); integration test covers coexistence |
| Inline-script behavior gaps vs stock (SPA nav, mobile) | Medium | Port stock script wholesale, delete fetch/trie parts only; e2e covers nav + toggle + persistence |
| `vintrinPath` key collides with future user frontmatter | Low | Reserved-key hard fail names the files; rename is a one-line vault fix |

## 9. Definition of done

`make test-vault-build` (post `vault-add-ids`) is green with: explorer showing the original folder hierarchy (folders collapse-only, docs title-labeled, hrefs all `/n/<docid>[.canvas]`), breadcrumbs on nested note + canvas pages, move-stability test passing, privacy leak-sentinel absent, no folder-listing pages emitted, unit + integration + e2e suites green, `vendor/quartz` diff empty (proving no patch), docs + ADR updated.
