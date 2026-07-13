# Spike B — hesprs/json-canvas-viewer integration surface (verified from source)

- **Repo read**: shallow clone at `.tmp/spikes/hesprs` (source of truth; all citations are `packages/...` paths + line numbers in that clone, version tag = published `4.3.2`).
- **Hands-on proof**: `.tmp/spikes/hesprs-experiment/` — npm-installed `json-canvas-viewer@4.3.2`, esbuild-bundled locally (no CDN), served + smoke-tested headlessly with system Chromium via `playwright-core`. **21/21 assertions PASS** (`logs/smoke3.log`); screenshot at `/.out/spike-B-hesprs-smoke.png`.

## Verdict (TL;DR)

The core viewer is a clean, small (≈130 KB min / ≈40 KB gzip incl. marked+dompurify), MIT, framework-free ESM library with exactly the extension points we need (`parser`, `attachments`, `nodeComponents`, theme + selection hooks). It renders text/md/image/audio/video/link nodes, groups, labeled+colored edges, minimap, touch. **Hard gaps vs Obsidian parity: subpaths (`#heading`/`#^block`) ignored, PDF cards unsupported, canvas→canvas cards render blank, edge arrow endpoints (`toEnd:'none'`, `fromEnd`) ignored, group background images ignored.** All gaps are fixable at build time by rewriting the canvas JSON before it reaches the viewer — no fork needed for MVP.

---

## 1. Package layout, npm names, browser bundle

Monorepo packages (`packages/*/package.json`):

| Package | npm name | Version (repo = npm latest) | Notes |
|---|---|---|---|
| core | `json-canvas-viewer` | **4.3.2** | vanilla TS, zero framework. `main/module: dist/index.js` (ESM only), `unpkg/jsdelivr: dist/chimp.js` |
| preact | `@json-canvas-viewer/preact` | 1.1.1 | thin component wrapper around core (`packages/preact/src/Viewer.tsx`), peer `preact ^10.28.4` |
| react | `@json-canvas-viewer/react` | 1.1.1 | same wrapper, peer react 19 |
| vue | `@json-canvas-viewer/vue` | 1.1.1 | same, peer vue 3.5 |
| vite | `vite-plugin-json-canvas` | 1.0.1 | build-time `.canvas` import loader (marked at build time) |
| shared | `@repo/shared` | private | the JSON Canvas types + `Parser` type (`packages/shared/index.ts`) |

- `json-canvas-viewer-preact` does **not** exist on npm (E404); the scoped `@json-canvas-viewer/preact` does.
- **Prebuilt browser bundle**: `dist/chimp.js` — a **self-contained minified ESM bundle** (all 5 deps inlined; `packages/core/tsdown.config.ts:15-22` `alwaysBundle: deps`). 129,474 bytes / 38.3 KB gzip. It is ESM (`export{...}` at end), **no UMD/IIFE build exists** — self-host it and load with `<script type="module">`.
- **Best for our static pages**: the vanilla core (`json-canvas-viewer`), bundled by our build tool (esbuild) into each site bundle — proven below. Quartz 5 being Preact-based doesn't help: Quartz emits static HTML, and the canvas must boot client-side anyway, so a plain `new JSONCanvasViewer({container...})` in an emitted script is the simplest robust path. (`@json-canvas-viewer/preact` remains an option if we ever mount it inside a Quartz interactive island.)

## 2. Constructor options (full, exact)

`new JSONCanvasViewer(options, modules?)` — `packages/core/src/kernel/index.ts:49`. Options are the union of every module's `Options` type (DI + type-level merge, `kernel/index.ts:35`):

```ts
type Options = {
  // kernel/index.ts:19-22
  container: HTMLElement;                    // required; viewer fills it (100%/100%)
  loading?: 'normal' | 'lazy' | 'none';      // lazy = IntersectionObserver rootMargin 50px (kernel/index.ts:74-80)
  // DataManager.ts:14-18
  canvas?: JSONCanvas;                       // { nodes?, edges? } — plain JSON Canvas object
  attachments?: Record<string, string>;      // original node.file path -> served URL
  shadowed?: boolean;                        // render into open shadow root (DataManager.ts:85-87)
  // OverlayManager.ts:20-23
  parser?: (markdown: string) => string | Promise<string>;   // shared/index.ts:1
  nodeComponents?: Partial<{                 // OverlayManager.ts:54-65
    text:     (o: CompArgs<JSONCanvasTextNode>) => void | Promise<void>;
    markdown: (o: CompArgs<JSONCanvasFileNode>) => void | Promise<void>;
    image:    (o: CompArgs<JSONCanvasFileNode>) => void | Promise<void>;
    audio:    (o: CompArgs<JSONCanvasFileNode>) => void | Promise<void>;
    video:    (o: CompArgs<JSONCanvasFileNode>) => void | Promise<void>;
    link:     (o: CompArgs<JSONCanvasLinkNode>) => void | Promise<void>;
  }>;
  // StyleManager.ts:26-32
  theme?: 'dark' | 'light';                  // default 'light' (StyleManager.ts:119)
  colors?: { light?: Colors; dark?: Colors };// override presets '0'..'6' + named colors (StyleManager.ts:42-80)
  // InteractionHandler.ts:26-28
  pointeract?: PointeractOptions;            // raw options for the gesture lib
  // per optional module:
  minimapCollapsed?: boolean;                // Minimap/index.ts:17-19
  preventMistouchAtStart?: boolean;          // MistouchPreventer/index.ts:8-11
  controlsCollapsed?: boolean;               // Controls/index.ts:10
};

type CompArgs<N> = {                          // OverlayManager.ts:37-44
  container: HTMLDivElement;                 // the node's .JCV-content div — append your DOM here
  content: string;                           // text: parsed HTML; file: resolved URL; link: url
  node: N;                                   // NOTE: node.file already mutated to resolved URL (DataManager.ts:129-137)
  onBeforeUnmount: Hook; onActive: Hook; onLoseActive: Hook;  // Hook = callable + .subscribe/.unsubscribe (kernel/utilities.ts:77-82)
};
```

Instance API (augmented at runtime): `load()`, `dispose()`, `changeTheme(theme?)`, `resetView()`, `toggleFullscreen()`, `pan/panToCoords/zoom/zoomToScale`, hooks `onStart/onRestart/onDispose/onRefresh/onResize/onToggleFullscreen/onChangeTheme/onNodeActive/onNodeLosesActive` (docs-internal/2 & the modules' `Augmentation` types).

## 3. `parser` option

- Signature: `(markdown: string) => string | Promise<string>` (`packages/shared/index.ts:1`). **Async supported** — call sites `await` it (`OverlayManager.ts:113`, `:186`).
- Called for **text nodes** (`OverlayManager.ts:186` — `this.parse(ref.text)`) **and markdown file nodes** (`OverlayManager.ts:101-119` — after runtime `fetch`).
- **No sanitization after your parser** — output goes straight into `innerHTML` (`OverlayManager.ts:118` and `:123`). Only the *exported* convenience `parser` runs marked + DOMPurify (`utilities/parser.ts:4-6`). Our build must sanitize inside its own parser (or trust its own build-time output).
- Default parser is **identity** (`OverlayManager.ts:148`) — i.e. **pre-rendered HTML is natively supported for text nodes**: put HTML into `node.text` and pass no parser (or an identity one). Proven trick for **markdown file nodes**: the type dispatch regex runs on the *original* filename, but the fetch uses the *remapped* URL (`DataManager.ts:129-137`), so we can map `notes/note.md -> /prerendered/note.html` and use an identity parser → fully build-time-rendered note cards with zero client markdown work.

## 4. `attachments` option

- Shape: `Record<string, string>` — key = original `node.file` value in the canvas JSON, value = served URL (`DataManager.ts:17`, docs-internal/2:74-81).
- Applied to **all file nodes** regardless of media kind (md, image, audio, video — `DataManager.ts:129-137`); skipped when the path contains `://` (line 134).
- Implementation detail (**caveat**): it **mutates `node.file` in place** on the canvas object you passed — pass a fresh/cloned object per `load()`, and custom components see the URL, not the vault path (proven in smoke test).
- **Missing key**: `node.file` used as-is → relative fetch. `fetch()` does not reject on HTTP 404, so for a missing .md the **404 response body is parsed and rendered as the card content** (proven: card showed "not found"). The `Failed to load content.` fallback (`OverlayManager.ts:114-117`) only triggers on network-level errors. Images/audio/video just show broken media. Our build must guarantee the map is complete.

## 5. Hooks / selection behavior

- `onNodeActive: Hook<[JSONCanvasNode]>`, `onNodeLosesActive: Hook<[JSONCanvasNode]>` (`OverlayManager.ts:143-144`), subscribe via `viewer.onNodeActive.subscribe(node => ...)`.
- Fired from `select()` (`OverlayManager.ts:214-232`) on every "true click" (pointeract distinguishes click from drag). **No onNodeClick / no double-click hook exists.**
- Verified behavior (headless): **first click selects** (adds `.JCV-active`, fires `onNodeActive`) and does **not** navigate; while selected and hovered, interactions are handed to the card content (pointeract stopped, `InteractionHandler.ts:59-60`, click-layer `pointer-events:none`, `styles.scss:131-138`) so **a second click on the same card fires nothing new** and inner links become clickable; clicking another node fires `onNodeLosesActive(old)` + `onNodeActive(new)`; clicking empty canvas fires `onNodeLosesActive`. Exactly Obsidian-publish-like "click to activate" semantics.
- Per-node `onActive/onLoseActive` hooks are also passed to custom components (`OverlayManager.ts:272-283`).

## 6. `nodeComponents` — full render override

- Per node *kind*: `text | markdown | image | audio | video | link` (`OverlayManager.ts:54-65`). Note: kinds are the viewer's media classification of file nodes by extension (`fileRegex`, `OverlayManager.ts:30-35`) — **there is no `pdf` or `canvas` kind, and unmatched file nodes never reach any component** (`OverlayManager.ts:189-195` loops only `supportedTypes` line 67).
- Contract: plain function receiving `{container, content, node, onBeforeUnmount, onActive, onLoseActive}`; you imperatively append DOM to `container` (may be async, return value ignored — `OverlayManager.ts:276-283`). Defining a kind **replaces** the default renderer for all nodes of that kind (`OverlayManager.ts:160-161`). The framework wrappers lift these into JSX slots via portals (`packages/preact/src/Viewer.tsx:132-175`).
- Minimal file-node component with a header button (proven working in smoke test, `hesprs-experiment/src/main.js`):

```ts
new JSONCanvasViewer({
  container, canvas, attachments,
  nodeComponents: {
    markdown: async ({ container, content, node, onActive }) => {
      const btn = document.createElement('button');
      btn.textContent = `Open ${node.file}`;           // node.file == resolved URL here!
      btn.addEventListener('click', () => openNote(content));
      container.appendChild(btn);
      const body = document.createElement('div');
      body.innerHTML = await renderSomehow(await (await fetch(content)).text());
      container.appendChild(body);
      onActive.subscribe(() => {/* card selected */});
    },
  },
});
```

## 7. Obsidian-parity behavior answers

| # | Question | Answer (source + proof) |
|---|---|---|
| a | `subpath` (`#heading`/`#^block`) | **Ignored.** `subpath?: string` exists in the type (`shared/index.ts:13`) but is never read anywhere in `packages/core/src` (grep: only the type declaration). Proven: node with `subpath: "#Section Two"` rendered the **full note**. Obsidian stores subpath as a separate field (not in `file`), so attachments keys still match. |
| b | PDF file nodes | **Unsupported.** `fileRegex` (`OverlayManager.ts:30-35`) covers audio/image/markdown(txt)/video only; PDFs get no overlay — only the filename painted above an empty spot (`Renderer.ts:160-165`). Proven: `doc.pdf` → no DOM overlay. |
| c | File node → another `.canvas` | **Blank.** Same unmatched-extension path as PDFs: filename label, no body, no error. Proven: `sub.canvas` node absent from overlay list. |
| d | Markdown file nodes | **Confirmed**: runtime `fetch(resolvedUrl)`, frontmatter stripped by regex `^---\n...---\n` (`OverlayManager.ts:109-113`), result passed through `parser`, injected via `innerHTML` (`:118`). Proven incl. frontmatter removal. |
| e | Edges & groups | Edge **labels** (multi-line, pill background) ✅ (`Renderer.ts:198-270`); **colors** preset `"1".."6"` + any hex ✅ (`StyleManager.getColor` `:162-177`; proven `#ff00ff`). **Arrows: always exactly one arrowhead at the destination** — `drawArrowhead` unconditional (`Renderer.ts:197`); `toEnd:'none'` ignored (proven visually), `fromEnd` not even in the edge type (`shared/index.ts:32-42`). Groups: colored rect + label bar ✅ (`Renderer.ts:152-158`); **`background`/`backgroundStyle` image ignored** (never read). Z-order: groups/edges painted on the `<canvas>` layer, always *behind* all DOM card overlays — matches Obsidian for the common case; no per-node z sorting. |
| f | Theme | `theme: 'light'\|'dark'` option; runtime `viewer.changeTheme('dark'\|'light'\|undefined→toggle)` (`StyleManager.ts:182-189`) — recolors CSS vars + repaints + recolors overlays (`OverlayManager.ts:206-212`); `onChangeTheme` hook. **Proven at runtime** on the vanilla build. No automatic `prefers-color-scheme` — our wrapper wires that. |
| g | Minimap / limits / touch | `Minimap` optional module (collapsible, viewport rectangle) ✅ proven. Zoom clamped to **0.05×–20×** (`InteractionHandler.ts:99`); no pan limits. Touch: pointeract `MultitouchPanZoom` + `Click`/`Drag` (`InteractionHandler.ts:50-57`), plus optional `MistouchPreventer` module (blocks scroll-hijack until intentional). |
| h | `renderToString` | `utilities/render-to-string.ts` — async, `{canvas, attachments?, parser?}` → **flat concatenated HTML string of node contents** (no positions/layout; md fetched via `fetch`, images/audio as plain tags, link nodes as `<a>`; lines 21-45). Purpose = SEO placeholder inside the container. **No true hydration**: on boot the viewer wipes `container.innerHTML` and rebuilds (`DataManager.ts:82-83`); the framework wrappers just inject it via `dangerouslySetInnerHTML` (`preact/src/Viewer.tsx:215`). Node-side use requires a `fetch` polyfill/absolute URLs. Marginal value for us — we already emit full markdown pages for SEO. |

## 8. Published package vs repo

- `npm view json-canvas-viewer versions` → 3.0.0 … **4.3.2** (latest = repo source; `logs/npm-view.log`).
- Published ESM (`dist/index.js`) is **unbundled** (`tsdown.config.ts:12` `unbundle: true`) with **5 real runtime deps**: `marked ^18`, `dompurify ^3.4`, `@needle-di/core`, `pointeract`, `@ahmedsemih/color-fns` (npm dependencies match `packages/core/package.json:56-62`). `dist/chimp.js` is the self-contained variant.
- `@json-canvas-viewer/preact` published 1.0.0 … **1.1.1** (matches repo); `json-canvas-viewer-preact` (unscoped) **does not exist** (E404).

## Hands-on proof summary (`.tmp/spikes/hesprs-experiment/`)

- `npm i json-canvas-viewer@4.3.2` (+ dev `esbuild`, `playwright-core`; logs in `logs/`).
- `src/main.js`: vanilla mount with custom **async wikilink parser** (`[[X]] → <a href="/X">` then exported marked+DOMPurify parser), **attachments map**, `Controls` + `Minimap` modules, hook logging, plus a second viewer proving a **custom `markdown` nodeComponent with header button**.
- `site/vault/main.canvas`: text card w/ markdown+wikilink, md file node, md file node w/ `subpath`, `.canvas` file node, image node, pdf node, unmapped md node, link node, group, 2 edges (labeled/colored/`toEnd:'none'`/hex color).
- `npx esbuild src/main.js --bundle --format=esm --minify` → **129.7 KB (40.5 KB gzip), zero CDN at runtime** — self-hosting proven.
- `node smoke.mjs` (local HTTP server + headless system Chromium): **21/21 PASS** (`logs/smoke3.log`), screenshot `/.out/spike-B-hesprs-smoke.png`.

## First-draft wrapper design

One isolated adapter so the rest of the site generator never touches viewer internals (OCP: gaps are fixed by *rewriting canvas JSON*, not by patching the viewer):

```ts
// canvas-view.ts — the ONLY module that imports json-canvas-viewer
import { JSONCanvasViewer, Controls, Minimap, MistouchPreventer, parser as markedParser } from 'json-canvas-viewer';
import type { JSONCanvas, JSONCanvasNode } from 'json-canvas-viewer';

export type CanvasViewOptions = {
  resolveLink: (target: string) => string;          // wikilink target -> site URL
  attachments: Record<string, string>;              // vault path -> published asset URL (MUST be complete)
  onOpenNote?: (url: string, node: JSONCanvasNode) => void; // e.g. header-button navigation
  theme?: 'light' | 'dark';                         // default: prefers-color-scheme
};

export class CanvasView {
  private readonly viewer;

  constructor(container: HTMLElement, canvasJson: JSONCanvas, opts: CanvasViewOptions) {
    const wikilinkParser = async (md: string) =>
      await markedParser(md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (_, target, alias) => `<a href="${opts.resolveLink(target)}">${alias ?? target}</a>`));

    this.viewer = new JSONCanvasViewer({
      container,
      canvas: structuredClone(canvasJson),          // viewer mutates node.file — never hand it the original
      attachments: opts.attachments,
      parser: wikilinkParser,                       // md is small; or: prerender at build + identity parser
      theme: opts.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
      loading: 'lazy',
      nodeComponents: opts.onOpenNote && {
        markdown: async ({ container, content, node, onActive }) => { /* header button + default-ish body */ },
      },
    }, [Controls, Minimap, MistouchPreventer]);
  }

  setTheme = (t: 'light' | 'dark') => this.viewer.changeTheme(t);
  dispose = () => this.viewer.dispose();
}
```

Build-time companion (`canvas-transform.ts`, pure function, unit-testable): takes vault-relative canvas JSON and emits `{canvasJson, attachments}` where
1. every `node.file` gets an `attachments` entry (asset copied to `/assets/...`),
2. **md+subpath** nodes are rewritten to a virtual file (`note.md#Sec` → `note__sec.frag.md` → prerendered HTML fragment URL),
3. **.canvas file nodes** are rewritten to `link` nodes pointing at the target canvas's published page (renders inline via iframe + navigable),
4. **.pdf file nodes** are rewritten to `link` nodes pointing at the PDF URL (browser-native PDF iframe), and
5. unknown extensions get a text-node fallback ("Unsupported attachment: …").

## GAP LIST vs Obsidian read-only parity checklist

| Capability | Status | Severity | Mitigation |
|---|---|---|---|
| Text cards w/ markdown | ✅ works (bring your own parser; wikilinks via custom parser — proven) | — | sanitize in our parser (viewer doesn't after custom parsers) |
| Note cards (.md file nodes) | ✅ works (runtime fetch, frontmatter stripped — proven) | — | complete attachments map mandatory (404 body gets rendered); optional: build-time prerendered-HTML remap trick (§3) for zero client parsing |
| Note card `#heading` / `#^block` subpath | ❌ `subpath` never read — full note shown (proven) | **High** (common Obsidian pattern) | **build-time**: slice md per (file, subpath) into fragment files and rewrite `node.file` per node; no viewer change needed |
| Media cards image/audio/video | ✅ broad extension coverage (`OverlayManager.ts:30-35`) | Low | images are `object-fit: cover` (Obsidian ≈ contain) — 1-line CSS override |
| PDF cards | ❌ no overlay at all; `nodeComponents` cannot target them (no `pdf` kind) | Medium | **build-time**: rewrite pdf file node → `link` node (iframe'd PDF); verify sandbox `allow-scripts allow-same-origin` permits Chrome's PDF viewer, else text-node `<embed>` via parser |
| Canvas→canvas cards | ❌ blank body, filename only (proven) | Medium | **build-time**: rewrite → `link` node to the target canvas's published page (inline preview + navigation); MVP-minimal: text-node link "Open canvas →" |
| Link cards (iframe) | ✅ sandboxed iframe (proven; same X-Frame-Options limits as Obsidian) | — | — |
| Groups: bg color, label | ✅ (proven) | — | — |
| Groups: `background` image | ❌ ignored (`Renderer.drawGroup` `:152-158`) | Low (rare) | accept for MVP; else fork/patch Renderer |
| Edges: labels, colors (preset+hex) | ✅ (proven incl. hex) | — | — |
| Edges: arrow endpoints (`toEnd:'none'`, `fromEnd:'arrow'`, bidirectional) | ❌ always exactly one arrow at destination (`Renderer.ts:197`) | Low-Med (visual fidelity) | accept for MVP (most Obsidian edges are single-arrow default); else upstream PR — it's a ~10-line unconditional call |
| Pan/zoom (mouse+touch), zoom 0.05–20× | ✅ | — | — |
| Minimap, controls, fullscreen, mistouch-prevention | ✅ optional modules (proven) | — | — |
| Light/dark, runtime switch | ✅ `changeTheme()` proven on vanilla build | — | wrapper wires site theme toggle + `prefers-color-scheme`; card typography is viewer-scoped CSS, override under `.JSON-Canvas-Viewer` to match site (docs-internal/6) |
| Wikilinks resolving everywhere | ✅ via one custom parser (text + note cards — proven) | — | links only clickable after card activation (matches "first click selects") |
| Self-hosting / no CDN | ✅ esbuild bundle 129.7 KB min / 40.5 KB gzip; or ship `dist/chimp.js` (ESM) | — | no UMD exists; `type="module"` required |

**Cross-cutting caveats**: (1) viewer mutates the passed canvas object (`node.file`) — always pass a clone; (2) no HTTP-status handling on attachment fetches — the generator must guarantee URLs; (3) `nodeComponents` cannot be used for unsupported extensions (pdf/canvas) — all such fixes must be canvas-JSON rewrites at build time, which is also the more robust layer for us.
