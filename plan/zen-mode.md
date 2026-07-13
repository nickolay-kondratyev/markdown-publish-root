# Zen Mode: hide sidebars AND reclaim their width (no Quartz fork)

**Status:** IMPLEMENTED (2026-07-10) — see `zen-mode/`, `scripts/e2e-zen-mode.mjs`, `docs/tickets/0002`. Implementation correction to §3.3: base sidebar rules nest under `.page > #quartz-body` (an **ID**), so zen sidebar selectors must carry `#quartz-body` too or they lose the cascade — the "root-attribute selectors out-specify base" claim below was wrong for those rules (the full-width-frame precedent works only because frames drop sidebars from the DOM).

**Addendum (2026-07-11) — search-in-zen:** zen hid the search bar with no way to search without exiting. The `ZenMode` component now renders a second button, `.zen-search` (magnifier), left of the lotus, whose click delegates to the real (hidden) `.search-button`, keeping search logic single-source. The zen CSS exempts the `.search` ROOT from the sidebar-children hiding (only `.search-button` is hidden) so the fixed search overlay can render; this also makes Ctrl/Cmd+K work in zen. WHY a sibling button instead of a second plugin component: the config loader supports one layout slot per plugin entry (`config-loader.ts buildLayoutForEntries` resolves one registry component per entry).
**Addendum (2026-07-13) — always-visible magnifier:** the magnifier was originally visible ONLY in zen; it is now ALWAYS visible and the cluster's LEFTMOST icon. The plugin's shared Flex wrapper is dissolved (`display: contents`) so the magnifier is its own flex item ordered first (`order: -1`) while the lotus keeps its next-to-fullscreen slot; the zen hide rule moved from wrapper-content to wrappers (`:has()`) so emptied wrappers leave no flex-gap holes mid-cluster.
**Owner:** Nickolay
**Audience:** Implementation agent. All extension points below were verified by reading the vendored source; file refs are exact.

---

## 1. Goal

A toolbar icon (lotus flower), sitting **next to the existing book icon** (reader-mode) in the left-sidebar toolbar, that toggles ZEN mode:

- ON: file explorer, graph, backlinks, TOC — all sidebar chrome — disappear AND the grid columns collapse, so the note content **reclaims the ~640px+** (2 × `$sidePanelWidth` 320px + gaps) of sidebar width. The toolbar icons stay reachable (you must be able to exit zen).
- OFF: stock layout returns.
- State survives SPA navigation and full reloads (localStorage, like darkmode).

**Why stock `reader-mode` is not enough:** it only sets `opacity: 0` on the sidebars (`.quartz/plugins/reader-mode/src/components/styles/readermode.scss`) — the `320px auto 320px` grid columns remain, width is NOT reclaimed.

**No-fork constraint:** `vendor/quartz` stays byte-identical to the pin. Everything goes through the two extension surfaces this repo already uses: the generated `quartz.config.yaml` (engine) and a **local plugin** (canvas-plugin precedent).

## 2. Verified extension points (do not re-derive)

| Mechanism | Where verified |
|---|---|
| Local plugin dirs are symlinked into `.quartz/plugins/` from a `source: <abs dir>` config entry | `vendor/quartz/quartz/plugins/loader/gitLoader.ts:412-462`; precedent: canvas-plugin entry in `engine/src/quartzConfigGenerator.ts:63` |
| `category: "component"` plugins: exports loaded from pkg `exports["./components"]` **or fallback `<dir>/components/index.js`**, registered by export name | `vendor/quartz/quartz/plugins/loader/componentLoader.ts`, `gitLoader.ts:644` (`getPluginSubpathEntry`) |
| Config `layout: {position, priority, group}` places a plugin component; `group: "toolbar"` is how darkmode (prio 30) and reader-mode (prio 35) sit in the icon row | `engine/src/quartzConfigGenerator.ts:201-226`, layout groups at `:254` |
| Components carry `css` / `beforeDOMLoaded` / `afterDOMLoaded` as **plain strings**; bundled into `index.css` (wrapped in `@layer quartz-base`) and pre/postscript | `vendor/quartz/quartz/plugins/emitters/componentResources.ts:58,411`; local precedent: `canvas-plugin/src/pageBody.js:41-42` |
| Grid to defeat: desktop `320px auto 320px` (`$sidePanelWidth`), `.page` capped at 1500px | `vendor/quartz/quartz/styles/variables.scss`, `base.scss:162-212` |
| Core precedent for collapsing the grid via CSS override | `base.scss:316-352` (`.page[data-frame="full-width"]`) |
| Toggle-script pattern (root attribute + `nav`/`render` re-setup + `window.addCleanup`) | `.quartz/plugins/reader-mode/src/components/scripts/readermode.inline.ts` |
| Persistence pattern (localStorage, applied beforeDOMLoaded → no FOUC) | `.quartz/plugins/darkmode/src/components/scripts/darkmode.inline.ts` |

**WHY-NOT frames:** plugins can register PageFrames (`frameLoader.ts`), but a frame is chosen per **pageType at build time** (`layout.byPageType[].template`) — not runtime-toggleable. Zen is a runtime toggle → CSS keyed on a `:root` attribute.

## 3. Design

### 3.1 New local plugin `zen-mode/` (repo root, sibling of `canvas-plugin/`)

```
zen-mode/
  package.json          # quartz manifest: category "component", components: { ZenMode: {...} }
  components/index.js   # exports ZenMode (fallback path componentLoader finds without an exports map)
  src/zenMode.js        # component: button + inline SVG lotus; css + scripts as string constants
  test/unit/*.test.ts   # see §5
```

Plain-Node-importable ESM, no build step (same gotcha-G6 rule as canvas-plugin). Preact JSX not available without a bundler → author the component with `preact` `h()`/JSX-free calls **or** copy canvas-plugin's approach for producing DOM (it returns hast/JSX via Quartz's own toolchain — check `canvas-plugin/src/pageBody.js` and mirror exactly what it does; the component signature is `(props) => JSX`, and Quartz transpiles plugin sources it imports, but local plain-ESM must not rely on JSX syntax — use `h()` from `preact`, which is already a repo dependency).

### 3.2 Toggle semantics

- Button class `zenmode`, root attribute `zen-mode="on|off"`, CustomEvent `zenmodechange` (mirrors reader-mode naming).
- `beforeDOMLoaded`: read `localStorage.getItem("zen-mode")`, set the root attribute immediately (no flash), then on `nav`/`render` bind click handlers with `window.addCleanup`.
- Click: toggle attribute + persist + dispatch event.

### 3.3 CSS (the width reclaim) — shipped as `ZenMode.css` string

```scss
/* Collapse the grid: single column, no sidebar areas (pattern: base.scss full-width frame) */
:root[zen-mode="on"] .page > #quartz-body {
  grid-template-columns: auto;
  grid-template-rows: auto auto auto;
  grid-template-areas: "grid-header" "grid-center" "grid-footer";
}
/* Right sidebar (graph/backlinks/TOC): gone entirely */
:root[zen-mode="on"] .sidebar.right { display: none; }
/* Left sidebar: taken OUT of the grid (fixed), everything hidden EXCEPT the
   toolbar row (search/darkmode/reader/zen icons) so zen can be exited.
   The toolbar group renders as a generic `.flex-component` div (Flex.tsx adds
   no group-name class) — that is the only stable selector for it. */
:root[zen-mode="on"] .sidebar.left {
  position: fixed; top: 0; left: 0;
  height: auto; width: auto; padding: 1rem; z-index: 2;
}
:root[zen-mode="on"] .sidebar.left > *:not(.flex-component) { display: none; }
/* Reclaim the .page cap too — zen means full available width */
:root[zen-mode="on"] .page { max-width: 100%; }
```

Notes:
- `display: none` on `.sidebar.left` is WRONG — it would hide the zen button itself (fixed-position descendants of `display:none` ancestors don't render). Hence fixed + child-filter.
- Root-attribute selectors out-specify the base grid rules inside the same `@layer quartz-base` — no `!important` needed.
- These overrides must hold at desktop/tablet/mobile: the single override (no media query) beats all three base media-query variants because base's media queries don't add specificity. Verify all three in §5 e2e anyway.
- Button styling mirrors `.readermode` (20px icon, `fill: var(--darkgray)`, no background/border).

### 3.4 Lotus icon

- Primary: **Phosphor Icons `flower-lotus`** (MIT — attribution comment with source URL + license goes above the path constant). Fetch the 256-viewBox path from `github.com/phosphor-icons/core` `assets/regular/flower-lotus.svg` at implementation time; embed inline `<svg>` with `fill="currentColor"`, sized/styled like the reader-mode book icon.
- Fallback (offline): hand-author a simple 3-petal lotus path in a 24×24 viewBox. Must read clearly at 20px; visually check in §5 screenshot step.
- Accessible: `aria-label` + `<title>` = "Zen mode" (skip i18n plumbing — our sites are single-locale; note-properties precedent hardcodes English options).

### 3.5 Engine wiring (`engine/src/quartzConfigGenerator.ts`)

- Add `zenModePluginDir` alongside `canvasPluginDir` (same default-resolution helper pattern, `repo root/zen-mode`).
- New plugin entry:
  ```js
  { source: zenModePluginDir, enabled: true,
    layout: { position: "left", priority: 40, group: "toolbar" } }
  ```
  Priority 40 = immediately after reader-mode (35) → **icon renders next to the book icon**.
- `byPageType`: leave as-is — zen stays available on content, folder, tag, and canvas pages ("404" already empties `left`). Zen on canvas pages = near-fullscreen canvas, a feature not a bug.
- Keep `reader-mode` enabled for now (its fade behavior is orthogonal); **follow-up ticket**: decide whether zen-mode subsumes it.

## 4. Decisions taken (flag to Nickolay if disagreeing)

1. **Full-bleed in zen** (`.page { max-width: 100% }`): user asked for "more full view"; long-line readability trade-off accepted. Trivial to soften later (e.g. `max-width: 1200px`).
2. ~~**Toolbar stays visible in zen** (floating top-left)~~ — superseded by Nickolay (2026-07-10): zen shows ONLY the lotus icon, pinned top-RIGHT, and hides the article/footer `hr`; search/darkmode return on exit.
3. **Persist across reloads** via localStorage (darkmode precedent) — reader-mode's session-only behavior would surprise.

## 5. Test plan (write failing tests first)

1. **Unit — engine** (`engine/test/unit/`): generated config contains the zen-mode local-source entry with `layout: {position: "left", priority: 40, group: "toolbar"}`; source path points at an existing directory containing `package.json` with `category: "component"`.
2. **Unit — plugin** (`zen-mode/test/unit/`): component module loads under plain Node; `ZenMode.css` contains `:root[zen-mode="on"]` and does NOT `display: none` the `.sidebar.left` itself; `beforeDOMLoaded` string references `localStorage` and `zen-mode`.
3. **E2E** (extend `scripts/e2e-smoke.mjs` or a new `scripts/e2e-zen-mode.mjs`, wired into `test:e2e`): build test-vault, serve, headless Chromium:
   - GIVEN a note page → zen button exists in the toolbar, positioned after the reader-mode button (DOM order).
   - WHEN clicked → `.sidebar.right` not visible, `.center` bounding width **strictly greater** than before (the actual reclaim assertion), zen button still visible/clickable.
   - WHEN clicked again → widths/visibility restored.
   - WHEN toggled on + SPA-navigate to another note → still on. Reload → still on.
   - Screenshot on/off states to `.out/` (visual icon check — lotus legible at 20px).
4. **Verify skill**: run `/verify` end-to-end after implementation.

## 6. Execution order

1. Failing engine unit test → engine wiring (§3.5).
2. Plugin skeleton (`package.json` manifest + `components/index.js` + `src/zenMode.js` with placeholder icon) until a local build renders the button in the toolbar.
3. CSS + toggle script + persistence (§3.2–3.3).
4. Lotus icon (§3.4).
5. E2E (§5.3), screenshots, `/verify`.
6. Docs: one-paragraph entry in `docs/current/usage.md`; follow-up ticket for reader-mode overlap (§3.5).
7. Commit at milestones (engine wiring / plugin renders / feature complete).

## 7. Risks / watch-outs

- **`.flex-component` selector breadth:** if a second non-toolbar flex group is ever added to the left sidebar, the child-filter in §3.3 keeps it visible too. Acceptable now (only one group exists); note in CSS comment.
- **Plain-ESM component loading:** componentLoader `import()`s the file directly — confirm no TS/JSX in the import chain (mirror canvas-plugin, which already proves plain ESM loads).
- **Search button in floating toolbar** has `grow: true` → may render wide when fixed; if ugly, constrain in zen CSS (`.sidebar.left .flex-component { width: auto }`).
- **Mobile:** base layout puts left sidebar as a top row; fixed-positioning in zen overlays content. Verify in e2e viewport pass; if broken, scope the `position: fixed` rules to `@media (min-width: 800px)` and let mobile zen just hide the right-sidebar blocks.
