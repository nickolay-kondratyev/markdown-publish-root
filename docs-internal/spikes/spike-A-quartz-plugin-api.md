# Spike A + C: Quartz 5 plugin API for canvas pages

- Date: 2026-07-08
- Quartz version examined: **5.0.0** (fresh shallow clone at `.tmp/spikes/quartz`)
- All file:line citations below are relative to the clone root
  `/home/nickolaykondratyev/git_repos/vintrin_markdown-publish-root/.tmp/spikes/quartz` unless absolute.

---

## Verdict: GO — plugin-shaped integration. Do NOT vendor/fork.

Quartz 5 (unlike Quartz 4) has a first-class **`pageType` plugin category with
`fileExtensions` support and virtual-page generation**, plus a **community-plugin loader that
accepts local filesystem paths** (no GitHub publishing needed). We proved end-to-end, hands-on:

1. A ~80-line local plugin (`local-plugins/hello-canvas`, plain ESM JS, registered by
   `source: ./local-plugins/hello-canvas` in `quartz.config.yaml`) claimed a dummy `.mycanvas`
   extension, and the build emitted `public/demo.mycanvas.html` containing our inline `<script>`.
2. The raw `.mycanvas` file was correctly *excluded* from the Assets copy (because of
   `fileExtensions`).
3. The canvas page registered outbound links (`data.links`), and the target note's **Backlinks
   panel lists the canvas**, and `static/contentIndex.json` (used by graph/search) contains
   `"demo.mycanvas": { "links": ["note-two"] }`.
4. `[[demo.mycanvas]]` wikilinks in markdown resolved to `href="./demo.mycanvas"`.
5. Bonus finding: **an official `github:quartz-community/canvas-page` plugin already exists and is
   enabled in the default config** (`quartz.config.default.yaml:120-121`). It emitted
   `real-canvas.canvas.html` with a full interactive pan/zoom canvas viewer for our test
   `.canvas` file. Our own canvas work can start from a config entry, an options tweak, or a
   fork of that single small plugin repo — not a fork of Quartz.

The only true "not-pluggable" behaviors found are (a) the content glob honoring `.gitignore` and
(b) markdown being the only *parsed* format — neither blocks canvas pages because pageType
plugins read their files directly from disk during `generate()`.

---

## 1. Plugin taxonomy

Four plugin categories, defined in `quartz/plugins/types.ts`:

| Category | Interface | Where |
|---|---|---|
| transformer | `QuartzTransformerPluginInstance { name; textTransform?; markdownPlugins?; htmlPlugins?; externalResources? }` | `quartz/plugins/types.ts:24-33` |
| filter | `QuartzFilterPluginInstance { name; shouldPublish(ctx, content) }` | `quartz/plugins/types.ts:35-41` |
| emitter | `QuartzEmitterPluginInstance { name; emit(ctx, content, resources); partialEmit?; getQuartzComponents?; externalResources? }` | `quartz/plugins/types.ts:49-72` |
| **pageType** | `QuartzPageTypePluginInstance { name; priority?; fileExtensions?; match(PageMatcher); generate?(PageGenerator); layout: string; frame?; body: QuartzComponentConstructor; treeTransforms? }` | `quartz/plugins/types.ts:105-140` |

`PluginTypes` container: `quartz/plugins/types.ts:15-20`. `VirtualPage { slug; title; data }`:
`types.ts:85-89`. Matcher combinators (`match.ext/slugPrefix/frontmatter/and/or/...`):
`quartz/plugins/pageTypes/matchers.ts`.

### Declaration / configuration
- Config file resolution order (`quartz/plugins/loader/config-loader.ts:30-41`):
  `quartz.config.yaml` → `quartz.plugins.json` (legacy) → `quartz.config.default.yaml`.
- YAML shape: `configuration:` (site config), `plugins:` (list of
  `{source, enabled, options, order, layout}`), `layout:` (groups + `byPageType` overrides).
  See `quartz.config.default.yaml`.
- Plugin category comes from the plugin's `package.json` `quartz.category` field (may be an
  array, e.g. canvas-page uses `["pageType","component"]`) — `config-loader.ts:200-236,315-401`.
- Factory convention: `default` export → `plugin` named export → sole exported function
  (`findFactory`, `config-loader.ts:536-576`). Instance shape is validated per category
  (`validateCategory`, `config-loader.ts:512-528`).
- Ordering: `order` in YAML (fallback `quartz.defaultOrder`, default 50) sorts within each
  category (`config-loader.ts:403-416`). PageTypes are additionally matched by descending
  `priority` at emit time (`dispatcher.ts:161`).
- Built-ins always added: `ComponentResources`, `Assets`, `Static` emitters, `NotFoundPageType`,
  and the `PageTypeDispatcher` emitter appended last (`config-loader.ts:474-499`).

### Install mechanism, and local plugins
- Sources are parsed by `parsePluginSource` (`quartz/plugins/loader/gitLoader.ts:67-142`):
  `github:user/repo[#ref]`, `git+https://…`, `https://…`, object form
  `{repo, subdir, ref, name}`, **and local paths** (`./…`, `../…`, `/abs`, `C:\…`) —
  `isLocalSource`, `gitLoader.ts:44-56`.
- Install target: `.quartz/plugins/<name>` (`gitLoader.ts:38`). Git sources are shallow-cloned
  and built (`npm install --ignore-scripts && npm run build`, `gitLoader.ts:360-404,471-533`);
  commits are pinned in `quartz.lock.json`.
- **Local sources are just symlinked** into `.quartz/plugins/<name>` — no clone, no build
  (`gitLoader.ts:421-468`). Proven: our `source: ./local-plugins/hello-canvas` entry loaded and
  ran with zero publishing.
- Install happens lazily at config load (`config-loader.ts:258-273`) and eagerly via
  `npx quartz plugin install` (`quartz/cli/plugin-git-handlers.js`).

## 2. Can a plugin do the four canvas requirements? YES (all proven)

**(a) Claim `.canvas` as content.** The file-extension gate is `quartz/build.ts:83-91`:
`glob("**/*.*")` collects **all** files; only `*.md` go to the parser
(`build.ts:84 markdownPaths = allFiles.filter(fp => fp.endsWith(".md"))`), but
`ctx.allSlugs = allFiles.map(slugifyFilePath)` (`build.ts:91`) — so non-md files already have
slugs and are wikilink-resolvable. A pageType plugin claims the extension via
`fileExtensions: [".canvas"]` and materializes pages via `generate({content, cfg, ctx})`
returning `VirtualPage[]`, reading the raw JSON itself from
`join(ctx.argv.directory, filePath)` (exactly what official canvas-page does,
`.quartz/plugins/canvas-page/src/pageType.ts:44-81`). `fileExtensions`' only mechanical effect
is excluding those files from the raw-asset copy (`quartz/plugins/emitters/assets.ts:9-28`).

**(b) Emit one HTML page per canvas.** The `PageTypeDispatcher` emitter
(`quartz/plugins/pageTypes/dispatcher.ts:150-246`) runs `generate()` for every pageType
(phase 1, lines 181-199), pushes results into `ctx.virtualPages`, renders each through the full
page layout (`emitPage` → `renderPage`, lines 69-108), and writes `<slug>.html`. Proven:
`public/demo.mycanvas.html` and `public/real-canvas.canvas.html`.

**(c) Inject client-side JS.** Three mechanisms:
- Inline `<script>` in the page body via Preact `dangerouslySetInnerHTML` — proven in
  `demo.mycanvas.html`.
- Component statics: `Body.css`, `Body.beforeDOMLoaded`, `Body.afterDOMLoaded` are collected by
  the `ComponentResources` emitter and emitted as hashed files
  (`quartz/plugins/emitters/componentResources.ts:37-70`; output
  `public/static/scripts/script-N-<hash>.js`, `component-<hash>.css`).
- `externalResources?: (ctx) => Partial<StaticResources>` on transformer/emitter instances
  (`quartz/plugins/types.ts:23,32,71`), where `StaticResources = {css: CSSResource[], js:
  JSResource[], additionalHead}` and `JSResource` supports external src or inline script,
  before/after DOM ready, `moduleType`, `spaPreserve` (`quartz/util/resources.tsx:5-44`).

**(d) Backlinks + graph.** Links live in `file.data.links: SimpleSlug[]`, normally populated by
the `crawl-links` transformer calling `transformLink` per anchor and collecting
`outgoing.add(simplifySlug(...))` → `file.data.links = [...outgoing]`
(`.quartz/plugins/crawl-links/src/transformer.ts:55,122,177-186`). Virtual pages can set
`data.links` directly in `generate()` — proven: our canvas's `links: ["note-two"]` made the
canvas appear in `note-two.html`'s Backlinks panel and in `static/contentIndex.json` (the data
source for graph view). Note: **the official canvas-page plugin does NOT register links today**
(no `links` anywhere in its src) — an easy upstream-able improvement, and exactly where our
`resolveVaultPath` recipe (below) slots in.

## 3. Programmatic invocation

- CLI entry: `quartz/bootstrap-cli.mjs` (the `bin` in `package.json`) → yargs commands →
  `handleBuild` in `quartz/cli/handlers.js:323`.
- `npx quartz build -d <dir> -o <dir>` exists. Full `BuildArgv` (`quartz/cli/args.js:75-120`):
  `--directory/-d` (default `content`), `--output/-o` (default `public`), `--serve`, `--watch`,
  `--baseDir`, `--port` (8080), `--wsPort`, `--remoteDevHost`, `--bundleInfo`, `--verbose/-v`,
  `--concurrency/-c`.
- There is **no stable exported library API**: `handleBuild` esbuild-bundles `quartz.ts` (with
  sass and `.inline.ts` loaders, `handlers.js:334-398`) into
  `quartz/.quartz-cache/transpiled-build.mjs`, then dynamically imports it and calls its default
  `(argv, mutex, clientRefresh)` (`handlers.js:438-441`; the default export is
  `quartz/build.ts:363-369`). The bundling step is load-bearing (scss/inline-script imports), so
  **treat the CLI as the programmatic interface**: spawn
  `node quartz/bootstrap-cli.mjs build -d … -o …` with cwd = quartz root. Requires Node >= 22
  (`package.json engines`; hard check `bootstrap-cli.mjs:2-8`; `.npmrc` sets
  `engine-strict=true`). We ran it with Node v26.4.0 via nvm.

## 4. Spike C: slug + wikilink resolution

All path utilities are re-exported by `quartz/util/path.ts:1-33` from the
`@quartz-community/utils` package (installed under `node_modules/@quartz-community/utils`;
implementation `dist/path.js`, types `dist/path.d.ts`). Community plugins import the same
functions, so behavior is identical across core and plugins.

Exact signatures (from `dist/path.d.ts`):

```ts
slugifyFilePath(fp: FilePath, excludeExt?: boolean): FullSlug
transformInternalLink(link: string): RelativeURL
transformLink(src: FullSlug, target: string, opts: TransformOptions): RelativeURL
interface TransformOptions { strategy: "absolute" | "relative" | "shortest"; allSlugs: FullSlug[] }
simplifySlug(fp: FullSlug): SimpleSlug       // strips trailing "index", "" -> "/"
resolveRelative(current: FullSlug, target: FullSlug | SimpleSlug): RelativeURL
```

Behavior details:
- `slugifyFilePath` (`dist/path.js:45-60`): strips `.md`/`.html`, **keeps any other extension in
  the slug** (`boards/demo.canvas` → `boards/demo.canvas`), per-segment slugification
  (`slugifyPath`, `dist/path.js:212-226`: whitespace→`-`, `&`→`-and-`, `%`→`-percent`, drops
  `?` `#`, lowercases), `_index`→`index`, `folder/folder`→`folder/index`.
- `transformLink` (`dist/path.js:176-211`): needed context = **the current file's slug** and
  **`allSlugs`** (built in `build.ts:91` as `allFiles.map(slugifyFilePath)`). Strategy
  `"shortest"` reproduces Obsidian's link semantics: unique basename match wins, then
  `resolveRelative(effectiveSrc, matchedSlug) + anchor`; anchors preserved via `splitAnchor`.
- Wikilink parsing lives in the `obsidian-flavored-markdown` plugin
  (`.quartz/plugins/obsidian-flavored-markdown/src/transformer.ts`): parses
  `[[path#heading|alias]]` into `WikilinkNode {path, heading, alias, embedded}` (regex at
  `transformer.ts:111-113`, kept for backward compat; parsing now via remark-obsidian). Non-embed
  links become mdast `Link` nodes; heading anchors are github-slugged; block refs `#^id` kept
  verbatim (`transformer.ts:190-300`). The href is then **resolved by the crawl-links html
  transformer**, not by ofm: `crawl-links/src/transformer.ts:122
  dest = node.properties.href = transformLink(fileSlug, dest, {strategy, allSlugs})`.

### The recipe (verified by execution — output below)

```ts
// resolveVaultPath.ts — reuse Quartz's own resolution, do not reimplement
import { slugifyFilePath, transformLink, simplifySlug } from "@quartz-community/utils"
import type { FilePath, FullSlug, TransformOptions } from "@quartz-community/utils"

/**
 * Resolve an Obsidian-style target (vault-relative path, bare note name, or
 * wikilink target incl. "#anchor") to a URL, exactly like Quartz does.
 *
 * @param target       e.g. "My Note", "Folder Name/My Note.md", "note#heading"
 * @param currentSlug  slug of the page the link appears on (for canvas pages:
 *                     slugifyFilePath("boards/demo.canvas"))
 * @param allSlugs     slugifyFilePath() of every vault file (Quartz builds this
 *                     as ctx.allSlugs in quartz/build.ts:91)
 * @returns            relative URL usable as href from currentSlug's page
 */
export function resolveVaultPath(
  target: string,
  currentSlug: FullSlug,
  allSlugs: FullSlug[],
): string {
  const opts: TransformOptions = { strategy: "shortest", allSlugs }
  return transformLink(currentSlug, target, opts)
}

// Slug of a vault file (what a page's URL path is, minus .html):
export const vaultPathToSlug = (fp: string): FullSlug => slugifyFilePath(fp as FilePath)

// For registering outbound links on a virtual page (backlinks/graph):
export const vaultPathToLinkEntry = (fp: string) => simplifySlug(slugifyFilePath(fp as FilePath))
```

Verified output (Node 26, real package):

```
slug of 'Folder Name/My Note.md'      = folder-name/my-note
slug of 'boards/demo.canvas'          = boards/demo.canvas
[[My Note]] from boards/demo.canvas   = ../folder-name/my-note
[[note-two#some-heading]]             = ../note-two#some-heading
simplifySlug('folder-name/index')     = folder-name/
```

Inside a Quartz plugin, `currentSlug` and `allSlugs` come for free:
`generate({ctx})` → `ctx.allSlugs` (`quartz/util/ctx.ts:31-47`), current slug =
`slugifyFilePath(filePath)` of the canvas file being processed.

## 5. Theme / dark mode

- CSS: variables defined on `:root`, dark overrides on `:root[saved-theme="dark"]`
  (`quartz/util/theme.ts:197,280`). Quartz 5 also exposes Obsidian-compatible aliases
  (`--background-primary`, `--text-normal`, `--color-base-XX`, …) in both modes
  (`theme.ts:209+`).
- Toggle (community `darkmode` plugin, `.quartz/plugins/darkmode/src/components/scripts/darkmode.inline.ts:1-45`):
  - persisted in `localStorage` key **`"theme"`** (`"light" | "dark"`), initial from
    `prefers-color-scheme`;
  - sets attribute **`saved-theme`** on `document.documentElement`;
  - also syncs body classes `theme-light` / `theme-dark`;
  - dispatches `document`-level `CustomEvent("themechange", { detail: { theme } })`.
- Recipe for a canvas page: style with the CSS variables (zero JS, auto-reacts), or listen:
  `document.addEventListener("themechange", (e) => e.detail.theme)`; read current via
  `document.documentElement.getAttribute("saved-theme")`. The official canvas-page plugin uses
  pure CSS variables (no themechange listener needed).

## 6. Non-markdown assets

`Assets` emitter (`quartz/plugins/emitters/assets.ts:43-69`): globs everything except `**/*.md`,
`ignorePatterns`, and every pageType's `fileExtensions` (`assets.ts:9-28`), then copies each file
to `output/<slugifyFilePath(fp)>` (`assets.ts:30-41`) — i.e. asset URLs are the slugified
relative path **with extension kept** (`Folder Name/img 1.png` → `/folder-name/img-1.png`).
`Static` emitter copies `quartz/static/**` → `public/static/`. In watch mode `partialEmit`
copies/deletes individual changed assets (`assets.ts:53-67`).

---

## Hands-on proof

Environment: `npm ci` with Node v26.4.0 (nvm) — success (log `.tmp/spikes/npm-ci.log`).
Then one-time plugin bootstrap (see Gotcha G1):

```bash
export PATH=/home/node/.nvm/versions/node/v26.4.0/bin:$PATH
cd .tmp/spikes/quartz
npm ci
./quartz/bootstrap-cli.mjs plugin install     # clones/builds the 45 configured community plugins
./quartz/bootstrap-cli.mjs build \
  --directory "$CONTENT_DIR" \
  --output ../quartz-experiment/public --verbose
```

Test content (2 md + 1 `.mycanvas` + 1 real `.canvas`):
`.tmp/spikes/quartz-experiment/content/{index.md, note-two.md, demo.mycanvas, real-canvas.canvas}`
(build was run against a copy outside the gitignored `.tmp/` tree — see Gotcha G2).

Result: exit 0, `Found 2 input files`, emitted 59 files including
`demo.mycanvas.html` (our plugin), `real-canvas.canvas.html` (official canvas-page),
`index.html`, `note-two.html`. Verified in output:
- `demo.mycanvas.html` contains `<div class="hello-canvas">…<pre data-canvas-json>{…}</pre>
  <script>console.log("hello-canvas inline script running on", …)</script>`.
- No raw `*.mycanvas` / `*.canvas` files in `public/` (claimed extensions excluded from Assets).
- `note-two.html` Backlinks: `<a href="./demo.mycanvas" class="internal">demo</a>`.
- `index.html`: wikilink rendered as `href="./demo.mycanvas"` and `href="./real-canvas.canvas"`.
- `static/contentIndex.json` contains `"demo.mycanvas": {"links": ["note-two"], …}`.

### The plugin that worked (registered as `source: ./local-plugins/hello-canvas`)

`local-plugins/hello-canvas/package.json`:

```json
{
  "name": "hello-canvas",
  "version": "0.0.1",
  "type": "module",
  "main": "index.js",
  "quartz": {
    "name": "hello-canvas",
    "displayName": "Hello Canvas (spike)",
    "category": "pageType",
    "defaultOrder": 55,
    "defaultEnabled": true
  }
}
```

`local-plugins/hello-canvas/index.js`:

```js
import fs from "fs"
import path from "path"
import { h } from "preact"
import { slugifyFilePath, simplifySlug } from "@quartz-community/utils"

const EXT = ".mycanvas"

function HelloCanvasBody() {
  function Body({ fileData }) {
    const json = fileData.helloCanvasJson ?? "{}"
    return h("div", { class: "hello-canvas" }, [
      h("h2", null, `Hello canvas: ${fileData.frontmatter?.title ?? fileData.slug}`),
      h("pre", { "data-canvas-json": "" }, json),
      h("script", {
        dangerouslySetInnerHTML: {
          __html: `console.log("hello-canvas inline script running on", document.location.pathname);`,
        },
      }),
    ])
  }
  Body.css = `.hello-canvas { border: 2px dashed var(--secondary); padding: 1rem; }`
  return Body
}

export default function HelloCanvasPageType() {
  return {
    name: "HelloCanvasPageType",
    priority: 10,
    fileExtensions: [EXT],                       // excludes raw file from Assets copy
    match: ({ slug }) => slug.endsWith(EXT),     // guard only; pages come from generate()
    generate({ ctx }) {
      const pages = []
      for (const fp of ctx.allFiles) {
        if (!fp.endsWith(EXT)) continue
        const raw = fs.readFileSync(path.join(ctx.argv.directory, fp), "utf-8")
        const links = []
        try {
          for (const node of JSON.parse(raw).nodes ?? []) {
            if (node.type === "file" && node.file)
              links.push(simplifySlug(slugifyFilePath(node.file)))
          }
        } catch {}
        pages.push({
          slug: slugifyFilePath(fp),
          title: path.basename(fp, EXT),
          data: { helloCanvasJson: raw, links },  // links => backlinks + graph
        })
      }
      return pages
    },
    layout: "canvas",
    frame: "default",
    body: HelloCanvasBody,
  }
}
```

Config registration (`quartz.config.yaml`, added to `plugins:`):

```yaml
  - source: ./local-plugins/hello-canvas
    enabled: true
    order: 55
```

---

## Gotchas

- **G1 — first build needs `npx quartz plugin install`.** `quartz/components/Head.tsx:7`
  statically imports the generated `.quartz/plugins/index.ts`; `.quartz/` is gitignored, so a
  fresh clone fails esbuild with `Could not resolve "../../.quartz/plugins"` until
  `plugin install` runs (it clones the ~45 default community plugins pinned by
  `quartz.lock.json` and regenerates the index). Network + git required at bootstrap; afterwards
  builds are offline.
- **G2 — the content glob honors `.gitignore`** (`quartz/util/glob.ts:18 gitignore: true`). If
  the vault directory sits under a gitignored path of an enclosing repo (our `.tmp/` did), the
  build silently reports `Found 0 input files`. Point `--directory` at a non-ignored location.
- **G3 — Node >= 22 / npm >= 10.9.2 enforced** (`package.json` engines + `.npmrc
  engine-strict=true` + runtime check `bootstrap-cli.mjs:2-8`).
- **G4 — only `.md` is parsed** (`build.ts:84`); watch-mode reparsing also skips non-md
  (`build.ts:229-231,259`). Not a blocker: pageType `generate()` reads canvas JSON from disk on
  every (re)emit, and `PageTypeDispatcher.partialEmit` re-runs `generate()` (`dispatcher.ts:247+`),
  so canvas edits still rebuild in `--serve`.
- **G5 — local plugins are symlinked, never built or peer-linked**
  (`gitLoader.ts:421-468`; `linkPeerDependencies` only runs for git installs,
  `gitLoader.ts:360-404`). Node resolves bare imports from the plugin's *real* path, so either
  keep the local plugin directory inside the Quartz clone (what we did) or ship a self-contained
  `dist/`. Allowed bare imports: Quartz's own deps + `@quartz-community/*` + declared peers
  (`getSharedExternals`, `gitLoader.ts:792-834`).
- **G6 — plugin must be loadable by plain Node** (dynamic `import()` at config load,
  `config-loader.ts:428`): write plain ESM `.js` (or prebuild TS to `dist/`); a bare `index.ts`
  entry will not import.
- **G7 — ordering matters**: category `order` (YAML) drives transformer/emitter sequence and is
  validated against manifest `dependencies` (`config-loader.ts:95-186`); pageType `match` is
  tried in descending `priority`, first match wins (`dispatcher.ts:161,215-229`).
- **G8 — slug keeps non-md extension**: canvas URLs look like `/boards/demo.canvas` (page file
  `demo.canvas.html`). `match.ext`'s fallback clause `|| !slug.includes(".")`
  (`matchers.ts:4-7`) means extension-less slugs match any `ext` matcher — rely on
  `generate()`+`priority`, not `match`, for extension claiming.
- **G9 — sharp postinstall**: our sandbox npm blocked sharp's install script
  (`allow-scripts` policy), so we disabled `favicon` and `og-image` plugins for the spike. On a
  normal machine this doesn't apply.
- **G10 — official canvas-page doesn't populate `data.links`** yet, so stock canvases are
  invisible to backlinks/graph. Registering links from `generate()` works (proven) — candidate
  upstream PR or reason to run a small fork *of the plugin* (single repo, `pageType.ts` ~90
  lines), still not of Quartz.
- **G11 — build cwd = quartz root.** `process.cwd()` is baked into config/plugin paths
  (`config-loader.ts:30-33`, `gitLoader.ts:38`); always invoke the CLI from the Quartz clone and
  pass the vault via `--directory` (absolute path works).

## Experiment artifacts

- Quartz clone + local plugin: `.tmp/spikes/quartz/` (`local-plugins/hello-canvas/`,
  `quartz.config.yaml`)
- Test vault: `.tmp/spikes/quartz-experiment/content/`
- Build output: `.tmp/spikes/quartz-experiment/public/`
- Logs: `.tmp/spikes/npm-ci.log`, `.tmp/spikes/plugin-install.log`, `.tmp/spikes/build3.log`
