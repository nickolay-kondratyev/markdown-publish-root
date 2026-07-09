GOAL: Create MVP to be able have INPUT: an Obsidian vault that contains markdown files and canvas files. OUTPUT: generate a static website that is ready to be hosted. Canvas nodes can have markdown in them that renders properly and is able to navigate to other canvases, and canvas is able to have [[wiki links]] that navigate to notes. In short it should support the current obsidian canvas capability (WITHOUT the editing portion). The code should be done in modular way with good documentation so that MVP can evolve. 

# Obsidian Publish Replacement: MVP Plan (Nexus Document)

**Status:** Phase 0 complete. Deviations discovered by spikes are recorded in `docs/status/phase-0.md` and `docs/decisions/0001-own-pagetype-plugin-with-hesprs-viewer.md` (notably: Quartz 5 DOES ship an official canvas-page plugin — we build our own pageType plugin with hesprs and disable it; Quartz is not on npm; Node >= 22 required).
**Owner:** Nickolay
**Audience:** Implementation agent. This document contains all required context. Read fully before writing code.

---

## 1. Product Vision and Context

We are building a paid replacement for Obsidian Publish. End users press a "publish" button inside Obsidian; we do all building and hosting. Target price point: ~$8/month. Hosting model: static sites on S3 + CloudFront.

**The wedge feature is canvas publishing.** Official Obsidian Publish does NOT support publishing `.canvas` files. The feature request has been open since December 2022 (https://forum.obsidian.md/t/publish-support-canvas/49206) with sustained demand and no delivery. Quartz, the dominant free alternative, also does not support canvas (https://github.com/jackyzha0/quartz/issues/628). Users currently add `**/*.canvas` to ignore patterns because canvas files break builds. Existing workarounds were criticized in the forum thread: sharecanvas.io (closed source, manual uploads) and BrainPress (requires running a server). The community explicitly wants static-file output that can live on S3/CloudFront-class hosting. That is exactly what we are building.

**Positioning:** "The Publish replacement that actually renders your canvases." Markdown and canvas are published together through one integrated pipeline: one URL scheme, one link resolver, one search index, one graph view.

**Business model:** open-core. The renderer/build pieces may be open sourced later for marketing and trust (customer sites do not die if we do). The paid layer is zero-ops hosting, one-click publish from Obsidian, and later server-backed features (native commenting is on the roadmap but explicitly OUT of MVP). Do not build anything comment-related now, but do not architect it out either: comments will anchor to canvas node IDs and coordinates, both of which survive this design.

**Critical framing:** end users NEVER run Quartz, never see Quartz config, never touch a terminal. Quartz is an internal build engine only.

---

## 2. Technology Decisions (Already Made, Do Not Relitigate)

| Component | Choice | License | Notes |
|---|---|---|---|
| Canvas format | JSON Canvas 1.0 spec | MIT, open spec | https://jsoncanvas.org/spec/1.0/ created by Obsidian, free to implement commercially |
| Canvas renderer | `hesprs/json-canvas-viewer` | MIT | https://github.com/hesprs/json-canvas-viewer npm: `json-canvas-viewer`. Chosen over React Flow for MVP (see 2.1) |
| Markdown site generator | `jackyzha0/quartz` (Quartz 5 if plugin API suffices, else vendored) | MIT | https://github.com/jackyzha0/quartz |
| Hosting | S3 + CloudFront | n/a | Per-site S3 prefix, CloudFront invalidation on publish |
| Client | Obsidian companion plugin (degenerate CLI version for MVP) | n/a | |

### 2.1 Why hesprs viewer and not React Flow

React Flow is MIT and safe (no gated pro features), but it is an editing library; a published canvas is read-only. hesprs already implements weeks of polish we would otherwise redo: markdown rendering inside nodes with scroll containment, group z-ordering, edge labels and arrow endpoints, the 6-color JSON Canvas palette with light/dark themes, minimap, mobile mistouch prevention, and prerendering via `renderToString`. Risk is single-maintainer, mitigated by: MIT (we can vendor/fork), small readable codebase, and the isolation rule in section 4.3. If during implementation we find ourselves overriding most of `nodeComponents` and fighting the interaction model, escalate to Nickolay; that is the trigger to reconsider React Flow. Do not switch unilaterally.

### 2.2 hesprs viewer integration surface (verified by reading source, v4.x)

The repo is a monorepo: `packages/core` (vanilla TS), plus `react`, `preact`, `vue` component packages and a `vite` plugin. Quartz is Preact-based; the Preact package (`json-canvas-viewer-preact` on npm, published by hesprs) is likely the right fit, but the vanilla core mounted on a placeholder div is also fine.

Mechanisms we will use:

- **`onNodeActive` / `onNodeLosesActive` hooks:** fire with the full `JSONCanvasNode` when a node is clicked/selected. For `type === 'file'` nodes, `node.file` is the vault-relative path. This is how whole-card click-to-navigate works.
- **UX caveat:** first click on a card SELECTS it (enables scrolling its content). Do not navigate on first activation or users can never read long note cards. Preferred pattern: custom node component with an explicit "open note" affordance in the card header; optionally navigate on second click of an already-active node.
- **`attachments` option:** a map from original `JSONCanvasFileNode.file` paths to served URLs. Required for embedded notes/images to load at all. Our build pipeline generates this from the slug map.
- **`parser` option:** `(markdown: string) => html`. The bundled default is marked + DOMPurify with NO `[[wikilink]]` support. We must inject a parser that resolves wikilinks to our published slugs, ideally reusing the same resolution as the markdown pipeline (see 4.2).
- **`nodeComponents` option:** full render override per node kind (`text`, `image`, `file`, `link`, `markdown`). Any defined field replaces the default renderer. Use for the open-note affordance and any custom chrome.
- **`theme` option:** `light` / `dark`, reactive in component builds. Must be wired to Quartz's theme toggle.
- **Prerendering:** `renderToString` exists. Investigate SSR of the canvas into static HTML with client hydration (improves first paint, makes canvas text indexable by Quartz search). Nice-to-have, not a blocker.
- Markdown file nodes: the viewer fetches the file, strips frontmatter, renders via `parser`. Link nodes render in a sandboxed iframe.

### 2.3 Quartz context

- Quartz 4 was fork-a-template. Quartz 5 (current) has a community plugin system: plugins declared in `quartz.config.yaml` by GitHub source, installed to `.quartz/plugins/`, typed as **transformer / filter / emitter / pageType** with ordered execution. `pageType` looks like the intended extension point for new content file kinds.
- **First implementation task (Phase 0):** verify against real Quartz 5 source that a pageType (or emitter) plugin can (a) claim `.canvas` files as content, (b) emit an HTML page per canvas, (c) inject client-side JS for the viewer, and (d) call Quartz's slug/wikilink resolver from plugin code. If the plugin API cannot do this cleanly, vendor Quartz as a git subtree and patch the core, keeping all our changes isolated in clearly marked modules for merge-friendliness. Since end users never run Quartz, forking is acceptable; plugin-shaped changes are preferred only to keep upstream merges cheap.
- Check Quartz's programmatic invocation (`npx quartz build --directory=...` exists; a programmatic API may or may not). Also note cold-build time on a large vault; incremental builds matter later for the service, not for MVP.

---

## 3. System Architecture

Four parts. MVP builds part 1 fully and a degenerate part 2.

1. **Build engine** (MVP core): a pure function `(vault snapshot, site config) -> static site directory`. Contains: publish filter, Quartz build with canvas support wired in, validation pass. No AWS calls, no auth, no tenant awareness inside it. Reads a directory, writes a directory.
2. **Client** (MVP: CLI): eventually the Obsidian companion plugin (auth, per-note publish toggles, manifest diff upload, trigger build). For MVP, a CLI that runs the engine against a local vault and syncs output to S3.
3. **Control plane** (NOT MVP): sites, users, billing, build queue, domains.
4. **Hosting** (MVP: script): `aws s3 sync` + CloudFront invalidation.

### The sacred boundary

The build engine must not know it is running in a service. If an S3 client, auth token, or tenant ID appears inside the engine, the boundary is drawn wrong. This is what makes the later service a thin wrapper (queue worker invoking the same engine) with zero engine changes.

### Config inversion

Quartz expects humans editing `quartz.config.yaml`. In our product, config is GENERATED. The engine accepts a small per-site settings object (site title, base URL, theme options, publish-filter rules) and programmatically emits Quartz config + layout each build. This deliberately exposes only the customization surface we are willing to support forever. Define the settings object schema early; keep it minimal.

---

## 4. The Integration Design (Markdown + Canvas Together)

### 4.1 Canvas processing stages, mapped to Quartz's plugin taxonomy

- **Transformer/parser stage:** pick up `.canvas` files, parse the JSON (spec is small: `nodes` and `edges` arrays; node types `text`, `file`, `link`, `group`; z-order = array order; 6 preset colors + hex). Register each canvas as a content node in Quartz's index with slug, title, and outbound links (file nodes -> referenced notes, plus wikilinks found inside text nodes). Registering links gets canvases into Quartz backlinks and graph view nearly for free. This is a differentiator; do it.
- **Emitter/pageType stage:** emit one HTML page per canvas containing the canvas JSON (inline `<script type="application/json">` or fetchable asset), the attachments/slug map, and a mount point + script for the viewer.
- **Asset stage:** route attachments referenced by canvases (images, media, embedded notes' media) through Quartz's existing asset handling so mapped URLs are real.

### 4.2 Shared link resolution (the actual integration; everything else is plumbing)

One function must be agreed on by both systems: `vaultPath -> published URL`. Quartz owns it (slugger, wikilink resolution, ignore/private filtering). The canvas side must CALL Quartz's resolver, never reimplement it, in three places:

1. The `attachments` map handed to the viewer.
2. The `parser` injected into the viewer, so `[[wikilinks]]` inside canvas text cards and embedded notes resolve to the same slugs as everywhere else. Strong preference: render card markdown at BUILD time using Quartz's own markdown transformer chain (consistent output, no client-side marked, searchable text), falling back to a client-side parser that wraps our resolver only if build-time rendering is impractical in MVP.
3. `onNodeActive` / open-note navigation URLs.

The resolver must handle ALL target kinds uniformly: `.md` notes, `.canvas` canvases, and attachments. Canvas -> canvas navigation (a file node or wikilink whose target is another `.canvas`) resolves to that canvas's page like any other link.

Reverse direction: teach Quartz's wikilink handling that `[[Something.canvas]]` from a markdown note resolves to the canvas page instead of 404ing. Embeds of canvases inside notes (`![[x.canvas]]`) and inline canvas-in-canvas previews can be follow-ups; navigable links/cards are enough for MVP.

### 4.3 Renderer isolation rule

Exactly one component/module owns the hesprs dependency (roughly `<CanvasView canvas resolveLink onOpenNote theme/>` plus its build-time counterpart). The rest of the pipeline emits JSON Canvas + a path->URL map, renderer-agnostic. This keeps the React Flow escape hatch cheap.

### 4.4 Privacy / degradation rule (decide in Phase 1, enforce in validation)

If a canvas references a note excluded by the publish filter, the build must NOT leak content. Default behavior: render that file node as an unlinked, contentless card (e.g. "private note" placeholder); make full omission a per-site option later. The validation pass fails the build if any emitted page contains content from an unpublished file.

---

## 5. MVP Scope

### Goal statement (authoritative)

> INPUT: an Obsidian vault containing markdown files and canvas files. OUTPUT: a static website ready to be hosted. Canvas nodes can have markdown in them that renders properly and can navigate to other canvases; canvases can have `[[wiki links]]` that navigate to notes. It should support current Obsidian canvas capability WITHOUT the editing portion. Code must be modular with good documentation so the MVP can evolve.

The primary deliverable boundary is the built static site directory. Deploy tooling (S3/CloudFront) is a thin optional layer on top, useful for dogfooding but not part of the core goal.

### Canvas capability parity checklist (read-only Obsidian parity)

- Text cards with full markdown rendering (build-time preferred, per 4.2).
- Note cards (`file` -> `.md`), including `subpath` support: `#heading` and `#^block` references render only the referenced section, as Obsidian does. Verify hesprs behavior in Spike B; if unsupported, resolve subpath content at build time before handing content to the viewer.
- Media file cards: images, audio, video. PDF cards: verify hesprs support in Spike B; acceptable MVP fallback is a card linking to the published PDF.
- **Canvas cards referencing other canvases** (`file` -> `.canvas`): must navigate to the target canvas page. Obsidian shows an inline preview; MVP minimum is a clearly styled navigable card, inline preview is a follow-up.
- Link cards (web pages, sandboxed iframe).
- Groups (backgrounds, labels, z-order), edges (sides, arrows, labels, colors), 6 preset colors + hex, pan/zoom, minimap, light/dark.
- Wikilinks ANYWHERE in canvas content (text cards, embedded note content, edge labels if Obsidian renders them) resolve to notes AND to other canvases via the shared resolver.

### In scope

- Local CLI: `publish build <vault> --config site.json --out ./public` and `publish deploy` (S3 sync + CloudFront invalidation).
- Publish filter: frontmatter flag (e.g. `publish: true`) and/or include-folder rules from site config.
- Full Quartz markdown site: pages, wikilinks, backlinks, graph, search, dark mode.
- Canvas pages: all four node types rendered, edges with labels/arrows, groups, colors, pan/zoom, minimap.
- Canvas <-> markdown interlinking both directions, per section 4.2.
- Canvases appear in graph view and backlinks.
- Attachments handling for both markdown and canvas.
- Validation pass: broken internal links reported; private-content leak check fails the build.
- Theme toggle consistency across markdown pages and canvas viewer.
- Stock Quartz theme is acceptable for MVP (see follow-ups).

### Out of scope (do not build)

- Commenting (roadmap; only constraint now is: do not destroy node IDs/coordinates in emitted pages).
- Control plane: accounts, billing, build queue, multi-tenancy.
- Custom domains automation (manual CloudFront setup is fine for MVP).
- Obsidian companion plugin UI (CLI stands in).
- Canvas editing of any kind. Published canvases are read-only.
- Incremental builds.

### Definition of done

Nickolay's own vault, containing markdown notes and at least two canvases, builds with one command into a static directory that works when served locally. The test canvas must exercise the parity checklist: text cards, an embedded note, a note card with a `#heading` subpath, an image, a group, labeled edges, a link card, a card referencing the SECOND canvas, and a reference to one private note. Clicking a note card's open affordance navigates to the published note. Clicking the canvas card navigates to the other canvas page. A wikilink inside a card navigates correctly to a note; a wikilink targeting a `.canvas` navigates to that canvas page. The private note renders as a placeholder and its content appears nowhere in the output. Both canvases show up in graph view. Lighthouse-reasonable load on mobile. Deploying the directory via the deploy script to S3+CloudFront is a bonus verification, not a gate.

---

## 6. Phased Execution Plan

**Phase 0: Spikes (timebox: short).**
- Spike A: Quartz 5 plugin API. Answer the four questions in 2.3. Output: written go/no-go on plugin-vs-subtree, with the chosen mechanism proven by a hello-world pageType that claims a dummy extension and injects a script.
- Spike B: hesprs viewer standalone. Render a real exported `.canvas` in a bare page with a custom parser and attachments map. Confirm the hooks and nodeComponents behave as documented in 2.2. Specifically verify: `subpath` (heading/block) handling on note cards, PDF file nodes, and how a file node targeting another `.canvas` renders by default. Output: the isolated `CanvasView` wrapper, first draft, plus a gap list against the parity checklist in section 5.
- Spike C: invoke Quartz's slugger/wikilink resolver from external code. Output: `resolveVaultPath()` utility.

**Phase 1: Engine skeleton.** Repo layout (suggested: `engine/` with vendored-or-dependency Quartz, `canvas-plugin/`, `cli/`). Config generation from the site settings object. Publish filter. Markdown-only build of the real vault working end to end locally. Decide and document the privacy degradation rule.

**Phase 2: Canvas integration.** Transformer (index + links), emitter (canvas pages), asset routing, build-time card rendering via Quartz's markdown chain (including subpath extraction for `#heading`/`#^block` note cards), attachments map, `CanvasView` mounting, open-note affordance, canvas -> canvas card navigation, `[[x.canvas]]` resolution from markdown, theme wiring. Close the gap list from Spike B against the parity checklist.

**Phase 3: Validation + deploy.** Leak check, broken-link report, `deploy` command (S3 sync, CloudFront invalidation, cache headers: long-max-age hashed assets, short HTML).

**Phase 4: Dogfood.** Publish Nickolay's vault. Fix the UX issues that only show up with real content (long note cards, huge canvases, mobile). Verify definition of done.

Each phase ends with a short written status: what was built, what deviated from this document and why, open questions.

---

## 7. Follow-ups (Post-MVP, Recorded So They Are Not Lost)

1. **Custom theme layer.** Stock Quartz is instantly recognizable; "it's just hosted Quartz" is the worst comparison at $8/month. Budget a full re-skin (typography, layout, canvas chrome) before public launch. MIT permits complete restyling.
2. **Native commenting** on notes and canvases (anchor to node IDs + coordinates). This is the moat feature; the backend stays closed-source.
3. **Obsidian companion plugin:** publish toggles, manifest-diff uploads, one-button publish, auth.
4. **Control plane:** tenancy, billing, build queue wrapping the unchanged engine.
5. **SSR/prerender of canvases** via `renderToString` + hydration, canvas text in search index (if not already achieved via build-time card rendering).
6. **Canvas embeds in notes** (`![[x.canvas]]`) rendering an interactive inline viewer.
7. **Open-source release decision** for the canvas plugin / renderer wrapper (marketing artifact answering Quartz #628; also creator-outreach material for Nicole van der Hoeven, Bryan Jenks, Curtis McHale, Eleanor Konik).
8. **Incremental builds / build performance** for the hosted service.
9. **Advanced Canvas plugin attributes** (hesprs already parses some of its extended spec); decide support level for power users.
10. **Per-site option:** omit vs placeholder for private-note references in canvases.

---

## 8. Working Agreements for the Implementing Agent

- **Documentation is a deliverable, not a nicety.** Each module (engine, canvas plugin, CanvasView wrapper, CLI) gets a README covering purpose, public interface, and how it evolves (what is stable vs expected to change). Functions get doc comments. Architecture decisions that deviate from this plan get a short ADR-style note in a `docs/decisions/` folder. The bar: a new agent or engineer can pick up any module cold.
- Prefer no-fork plugin-shaped changes to Quartz; vendoring/forking is acceptable when the API blocks progress, but isolate patches and document each one.
- Keep the sacred boundary (section 3) absolutely: the engine never touches AWS/auth/tenancy.
- Keep the renderer isolation rule (section 4.3).
- All licenses in the stack are MIT; do not introduce non-MIT/AGPL dependencies into the engine without flagging.
- When this document conflicts with reality discovered in code, reality wins; update this document and note the deviation.
- Escalate to Nickolay: renderer swap (2.1), plugin-vs-fork decision if Spike A is ambiguous, any change to the privacy rule, any scope addition.
