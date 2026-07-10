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
  (=> backlinks, graph, contentIndex) and its text-card plain text via
  `data.text` (=> search).
- **emitter** — writes the prerendered note fragments
  (`<canvas-slug>.fragments/<node-id>.html`) and the self-hosted viewer bundle
  (`static/canvas-viewer.js`) into the output. Emitted only when at least one
  canvas is staged.

## Build-time rewriting (src/canvasRewriter.js)

The client receives NO resolution or markdown work — everything is prebaked:

| Node | Rewrite |
|---|---|
| text | markdown -> HTML at build time (unified/remark/rehype, the same pipeline family Quartz uses); `[[wikilinks]]` resolved via the shared resolver relative to the canvas page |
| file -> `.md` | stays a file node; `attachments` remaps it to a prerendered fragment sliced from the note's PROCESSED Quartz hast (full fidelity: highlighting, callouts, resolved links, rebased via Quartz's own `normalizeHastElement`); `subpath` `#Heading` / `#^block` sliced with Quartz-transclude semantics; open-note affordance metadata in `noteLinks` |
| file -> `.canvas` | navigable link card to the target canvas page |
| file -> `.pdf` / unsupported ext | link card to the published asset (plan §5 MVP fallback) |
| file -> image/audio/video | stays a file node; `attachments` maps to the emitted asset URL |
| file -> unpublished/missing | contentless "Private note" placeholder — the vault path is REMOVED (plan §4.4) |
| group / link / edges | untouched |

Invariants: node ids + coordinates always preserved (future commenting anchors);
the attachments map is complete for every remaining file node (the hesprs viewer
renders fetch-404 bodies otherwise).

**Id-based publishing (ADR 0003):** staged canvas basenames are docids, so
display names come from `metadata.frontmatter.title` (engine-injected from the
original basename; `parseCanvas` preserves top-level `metadata`). The canvas
page title and canvas->canvas card labels use it — basename is only a fallback.
The plugin itself stays id-unaware: it renders whatever staged names/links the
engine baked.

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

## Renderer isolation (plan §4.3) — the React Flow escape hatch

`viewer/canvasView.js` is the ONLY module in the repo that imports the hesprs
`json-canvas-viewer`. Its interface: `mountCanvasView(container, {canvas,
attachments, noteLinks})` + `setTheme` + `dispose`. Everything upstream is
renderer-agnostic JSON. Swapping to React Flow (escalation path, plan §2.1)
means rewriting that one file and rebundling — nothing else changes.

The bundle is self-hosted (no CDN): `npm run bundle:viewer` (part of
`npm run setup`) esbuilds it to `dist/canvas-viewer.js` (~64 KB min; marked/
dompurify tree-shake out because no client-side parser is used — the identity
default injects prebaked HTML).

Client behavior: viewer mounts via the page's loader script (Quartz SPA
`nav`/`render` events + `window.addCleanup`, mirroring the official plugin's
pattern); theme follows `<html saved-theme>` and the `themechange` event; note
cards get a sticky header with the open-note link (first click on a card still
only SELECTS it, Obsidian-Publish-like — the header link is what navigates).

## How it is loaded

The engine's generated `quartz.config.yaml` registers this directory as a
LOCAL plugin source (absolute path). Quartz symlinks it into
`.quartz/plugins/`; Node resolves its bare imports from THIS repo's
`node_modules` (spike A, gotcha G5). The entry must stay plain-Node-importable
ESM `.js` (G6) — no build step, no TypeScript entry.

## Stable vs evolving

- **Stable:** renderer isolation boundary (`viewer/canvasView.js` owns hesprs);
  rewriter invariants (ids/coords preserved, complete attachments, privacy
  placeholder); the shared-resolver rule.
- **Evolving:** card chrome/CSS; hesprs gap fixes as upstream moves (edge
  `toEnd:none`/`fromEnd`, group background images — cosmetic, accepted for MVP);
  inline canvas-in-canvas previews and non-image embeds in text cards
  (follow-ups, plan §7.6).
