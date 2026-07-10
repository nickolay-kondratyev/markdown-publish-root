# vintrin-breadcrumbs (Quartz plugin)

Repo-local Quartz 5 **component** plugin: folder-shaped breadcrumbs over
stable-id URLs (ADR 0005, `plan/folder-nav-over-id-urls.md` §4.3). Replaces
the stock `@quartz-community/breadcrumbs`, whose slug-trie crumbs read
`Home ❯ n ❯ <docid>` under id-based publishing.

## How it works

- Crumbs derive from `fileData.frontmatter.vintrinPath` ALONE (pure
  `CrumbTrailBuilder`, `src/crumbTrail.js`):
  `Home` (the only link) ❯ folder segments (PLAIN TEXT — collapse-only
  folders have no URLs) ❯ current title (unlinked).
- No `vintrinPath` (tag pages, 404) → renders nothing. The Home page itself
  is excluded by the layout `condition: "not-index"` wrapper in the generated
  config.
- Never reads/writes `ctx.trie` — that slug-trie cache belongs to stock
  breadcrumbs/dispatcher.

## Options (generated config)

`spacerSymbol` (default `"❯"`), `rootName` (default `"Home"`),
`showCurrentPage` (default `true`) — mirrors the meaningful stock options.

## Constraints

Plain-Node-importable ESM, no build step (loader symlink, spike C). Styles in
`src/breadcrumbStyles.js` are stock `breadcrumbs.scss` flattened to plain CSS —
re-verify on deliberate Quartz pin bumps.

## Tests

`test/unit/crumbTrail.test.ts`; integration in
`engine/test/integration/folderNav.test.ts` (crumb trails on note + canvas,
only-Home-linked), e2e in `scripts/e2e-foldernav.mjs`.
