# ADR 0004: Folder-shaped navigation via local component plugins (no fork)

**Status:** Accepted (2026-07-10) · **Plan:** `plan/folder-nav-over-id-urls.md` · **Spike:** `docs/spikes/spike-C-local-component-plugin.md`

## Context

Id-based publishing (ADR 0003) made every doc URL a stable `/n/<docid>`, but
flattened the UI: stock Explorer and Breadcrumbs derive their trees from SLUGS
(`n/<docid>`), so users saw one meaningless flat `n/` bucket. Their
`mapFn`/`sortFn`/`filterFn` options run AFTER the trie shape is fixed —
configuration cannot restructure them.

## Decision

1. **Data channel:** staging injects the reserved frontmatter key
   **`vintrinPath`** (ORIGINAL vault-relative path incl. extension) into every
   staged doc — md frontmatter and canvas `metadata.frontmatter`. A publishable
   vault doc declaring the key itself hard-fails the build
   (`ReservedFrontmatterKeyError`, all offenders listed), mirroring docid
   validation. The canvas plugin passes the key through into virtual-page
   frontmatter.
2. **Replacement, not patching:** stock `explorer`, `breadcrumbs`, and
   `folder-page` are disabled in the generated config; two repo-local
   `category: "component"` Quartz plugins take their place, registered as
   absolute-path local sources exactly like `canvas-plugin/` (loader symlinks
   them; spike C proved the full mount path):
   - **`vintrin-explorer/`** — server-side renders the ORIGINAL folder
     hierarchy from `allFiles` + `vintrinPath` (pure `VaultTreeBuilder`);
     doc labels = injected titles, hrefs = stable-id slugs. Stock DOM classes
     and styles kept; the stock inline script ported MINUS its contentIndex
     fetch + client trie render (Quartz's SPA swaps the whole body per nav, so
     each page arrives with correct active/open state; the script keeps
     collapse persistence, mobile toggle, scroll restore).
   - **`vintrin-breadcrumbs/`** — `Home` (linked) ❯ folder segments (PLAIN
     TEXT) ❯ title (unlinked), derived from `fileData` alone; never touches
     the `ctx.trie` slug-trie cache stock components own.
3. **Folders are collapse-only.** Folders have no docids, hence no URLs, hence
   no links anywhere (Explorer rows, crumbs) and no `/n/` listing page —
   matching Obsidian Publish.

## Consequences (accepted)

- Published pages reveal each published doc's original folder path (tree,
  crumbs, staged frontmatter) — that IS the product intent. Folders holding
  only unpublished docs can never appear (tree derives only from staged docs;
  leak-sentinel folder test enforces it).
- Full tree HTML is baked into every page (fine at current scale; an
  emitter-generated JSON + client render stays available fork-free).
- Tag pages lose breadcrumbs (they have no `vintrinPath`).
- Moving a doc changes its tree/crumb location but never its URL
  (move-stability integration test).
- Ported styles/scripts live in OUR plugins: re-verify against stock on
  deliberate Quartz pin bumps (same policy as the resolver invariant).

## Alternatives rejected

- **Forking/patching stock explorer/breadcrumbs:** loses the no-fork invariant
  (ADR 0002) for a change their option surface cannot express anyway.
- **Folder listing pages:** would require a URL scheme for id-less folders —
  contradicts the stable-id URL space.
