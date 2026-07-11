# vintrin-canvas-page (Quartz plugin)

Our own Quartz 5 plugin that publishes Obsidian `.canvas` files as interactive
pages (ADR 0001: built instead of the official `canvas-page` plugin, which is
disabled in the generated config so there is exactly one claimant for `.canvas`).

## What it does

Dual Quartz category (`package.json` -> `quartz.category`):

- **pageType** — claims `.canvas` (keeps raw files out of the asset copy) and
  generates one virtual page per canvas: Quartz page chrome (theme toggle, nav,
  graph, backlinks) around an embedded, build-time-REWRITTEN canvas JSON payload
  plus a mount div. Registers each canvas's outbound links via `data.links`
  (=> backlinks, graph, contentIndex) and ALL visible canvas content via
  `data.text` (=> search): text cards, embedded-note fragments (subpath-aware),
  card titles, group labels, link URLs, edge labels. Privacy placeholders
  contribute nothing. The same per-card text (`searchParts`) is server-rendered
  into a `.popover-hint` block of bracketed pseudo-cards — hidden on the canvas
  page itself, cloned by the search preview panel and link popovers (which
  fetch static HTML, where the client-side viewer doesn't exist).
- **emitter** — writes the prerendered note fragments
  (`<canvas-slug>.fragments/<node-id>.html`) and the self-hosted viewer bundle
  (`static/canvas-viewer.js`) into the output. Emitted only when at least one
  canvas is staged.

## Build-time rewriting (src/canvasRewriter.js)

The client receives NO resolution or markdown work — everything is prebaked:

| Node | Rewrite |
|---|---|
| text | markdown -> HTML at build time (unified/remark/rehype, the same pipeline family Quartz uses); `[[wikilinks]]` resolved via the shared resolver relative to the canvas page |
| file -> `.md` | stays a file node; `noteLinks[node.id].fragmentUrl` points to a prerendered fragment sliced from the note's PROCESSED Quartz hast (full fidelity: highlighting, callouts, resolved links, rebased via Quartz's own `normalizeHastElement`); `subpath` `#Heading` / `#^block` sliced with Quartz-transclude semantics; fragments are per NODE, so several cards can embed the SAME note with different subpaths; open-note affordance metadata in `noteLinks` |
| file -> `.canvas` | navigable link card to the target canvas page |
| file -> `.pdf` / unsupported ext | link card to the published asset (plan §5 MVP fallback) |
| file -> image/audio/video | stays a file node; `attachments` maps to the emitted asset URL |
| file -> unpublished/missing | contentless "Private note" placeholder — the vault path is REMOVED (plan §4.4) |
| group / link / edges | untouched in the emitted JSON (group labels, link URLs, and edge labels still feed `searchText`). Dangling edges (an endpoint id with no matching node) are UNSUPPORTED — React Flow drops them at render time; Obsidian never saves them |

Invariants: node ids + coordinates always preserved (future commenting anchors);
the attachments map is complete for every remaining MEDIA file node, and every
note card carries its own `fragmentUrl` (the viewer shows "Failed to load
content." otherwise).

**Id-based publishing (ADR 0004):** staged canvas basenames are docids, so
display names come from `metadata.frontmatter.title` (engine-injected from the
original basename; `parseCanvas` preserves top-level `metadata`). The canvas
page title and canvas->canvas card labels use it — basename is only a fallback.
The plugin itself stays id-unaware: it renders whatever staged names/links the
engine baked.

**Folder navigation (ADR 0005):** `generate()` passes the engine-injected
`metadata.frontmatter.vintrinPath` (ORIGINAL vault path) through into each
virtual page's frontmatter, so the folder-shaped `vintrin-explorer` /
`vintrin-breadcrumbs` components place canvas pages like any doc.

**Privacy:** the plugin only ever sees the staging directory (publishable files
only), so it CANNOT distinguish a private note from a missing one — both get
the same placeholder, which also means the output is no oracle for whether an
unpublished file exists.

## Shared link resolution (src/resolver.js)

`VaultLinkResolver` wraps `@quartz-community/utils` — pinned in the root
package.json to the EXACT commit Quartz's own lockfile uses — and copies
crawl-links' canonicalization recipe for `data.links` registration. Canvas-side
resolution is therefore byte-identical to markdown-side resolution. Never
reimplement slugging; only compose these utils.

## Renderer isolation (plan §4.3) — React Flow viewer (ADR 0003)

`viewer/` is the ONLY module tree in the repo that imports the renderer
(`@xyflow/react` + `react`/`react-dom`; migrated from hesprs per ADR 0003).
The interface: `mountCanvasView(container, {canvas, attachments, noteLinks})`
+ `setTheme` + `dispose` (`viewer/canvasView.jsx`). Everything upstream is
renderer-agnostic JSON. Swapping the renderer again means rewriting `viewer/`
and rebundling — nothing else changes.

Inside `viewer/`: `canvasToFlow.js` (PURE payload -> React Flow graph
conversion, unit-tested in Node: handles/side inference, arrow endpoints,
preset+hex colors, z-order), `flowNodes.jsx` (text/note/media/link/group card
components), `canvasApp.jsx` (minimap, controls, fullscreen, mistouch wheel
gate), `minimapPreference.js` (collapsible minimap: one global
localStorage-backed choice that follows the user across canvases),
`canvasView.jsx` (mount/theme/dispose + fullscreen retention).

The bundle is self-hosted (no CDN): `npm run bundle:viewer` (part of
`npm run setup`) esbuilds `viewer/canvasView.jsx` to `dist/canvas-viewer.js`
(~397 KB min — React + React Flow; loaded lazily on canvas pages only). CSS
(React Flow base + `viewer/viewer.css`) is bundled as text and rendered inside
the mount so Quartz SPA DOM swaps cannot strip it.

Client behavior: viewer mounts via the page's loader script (Quartz SPA
`nav`/`render` events + `window.addCleanup`, mirroring the official plugin's
pattern); theme follows `<html saved-theme>` and the `themechange` event; note
cards get a sticky header with the open-note link (first click on a card still
only SELECTS it, Obsidian-Publish-like — the header link is what navigates;
implemented as a click-guard overlay that lifts on selection).

## How it is loaded

The engine's generated `quartz.config.yaml` registers this directory as a
LOCAL plugin source (absolute path). Quartz symlinks it into
`.quartz/plugins/`; Node resolves its bare imports from THIS repo's
`node_modules` (spike A, gotcha G5). The entry must stay plain-Node-importable
ESM `.js` (G6) — no build step, no TypeScript entry.

## Stable vs evolving

- **Stable:** renderer isolation boundary (`viewer/` owns React Flow);
  rewriter invariants (ids/coords preserved, complete attachments, privacy
  placeholder); the shared-resolver rule; the `mountCanvasView` contract.
- **Evolving:** card chrome/CSS; group background images (cosmetic gap,
  accepted for MVP); inline canvas-in-canvas previews and non-image embeds in
  text cards (follow-ups, plan §7.6).
