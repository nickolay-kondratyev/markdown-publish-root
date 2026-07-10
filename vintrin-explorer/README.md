# vintrin-explorer (Quartz plugin)

Repo-local Quartz 5 **component** plugin: the folder-shaped Explorer over
stable-id URLs (ADR 0005, `plan/folder-nav-over-id-urls.md` §4.2). Replaces
the stock `@quartz-community/explorer`, whose slug-trie tree collapses to a
flat `n/` bucket under id-based publishing.

## How it works

- **Data:** every staged doc carries `frontmatter.vintrinPath` (ORIGINAL
  vault-relative path, engine-injected at staging; canvas virtual pages get it
  via the canvas-plugin passthrough).
- **Tree (`src/vaultTree.js`):** pure `VaultTreeBuilder` builds the folder
  hierarchy from `allFiles` + `vintrinPath`. Labels = injected titles; hrefs =
  stable-id slugs (`resolveRelative` from `@quartz-community/utils` — slugging
  is never reimplemented). Root `index.md` (= Home) and pages without
  `vintrinPath` (tags, 404) are excluded, so folders holding only unpublished
  docs can never appear. Sort: folders first, natural case-insensitive alpha.
- **Render (`components/index.js`):** SERVER-SIDE per page — active link
  marked and its ancestor folders open in the HTML itself (no client fetch,
  no flicker). DOM classes mirror stock so ported styles apply.
- **Folders are collapse-only:** no `<a>` for folders, ever (no folder URLs
  exist). Collapse state persists in localStorage `fileTree`, keyed by the
  ORIGINAL folder path (stable across renames of nothing — folder moves
  re-key, accepted).
- **Inline script (`src/explorerScript.js`):** stock script minus the
  contentIndex fetch + client trie render (Quartz's SPA swaps the whole body
  per nav). Keeps: collapse toggles + persistence, mobile hamburger,
  scroll save/restore across SPA navs.

## Options (generated config)

`title` (default `"Explorer"`). Sort/filter are deliberately not configurable.

## Constraints

- Must stay plain-Node-importable ESM — no build step; the loader symlinks
  this dir into `vendor/quartz/.quartz/plugins/` (spike C).
- `src/explorerStyles.js` is the stock `explorer.scss` (plain CSS at our pin)
  minus folder-link rules — re-verify on deliberate Quartz pin bumps.

## Tests

`test/unit/vaultTree.test.ts` (tree semantics); integration/e2e live in
`engine/test/integration/folderNav.test.ts` and `scripts/e2e-foldernav.mjs`.
