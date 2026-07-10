# Spike C: local `component`-category Quartz plugin end-to-end

**Date:** 2026-07-10 · **Verdict: FEASIBLE — no fork needed.**
Executes Phase 0 of `plan/folder-nav-over-id-urls.md`. All refs relative to
`vendor/quartz` at the pinned commit.

## What was proven (hands-on, hello-world local plugin + full Quartz build)

A throwaway plugin dir (`package.json` with `quartz.category: "component"` +
`components/index.js`) was appended to the generated `quartz.config.yaml` as an
absolute local `source`, then the test-vault was built. Verified in output:

1. **Local component plugin mounts.** Loader symlinks the dir into
   `.quartz/plugins/<basename>` (`installPlugin`, gitLoader.ts:415-455) exactly
   like our canvas-plugin; manifest read from the `quartz` field of
   package.json (`readManifestFromPackageJson`, config-loader.ts:200).
2. **Naming rule (registry lookup).** Plugin name = **basename of the local
   dir** (`extractPluginName`, config-loader.ts:60). Components module resolved
   from package.json `exports["./components"]` OR fallback
   `<dir>/components/index.js` (`getPluginSubpathEntry`, gitLoader.ts:644 —
   fallback used; no exports map needed). Each manifest `components` entry is
   registered under `<pluginName>/<ExportName>` and bare `<ExportName>`; a
   **single-component plugin is additionally registered under the bare plugin
   name** (componentLoader.ts:52-65), which is what `buildLayoutForEntries`
   finds first (config-loader.ts:757). PascalCase(dir-name) lookup exists only
   as a fallback — with one component per plugin we don't depend on it, so the
   export key does NOT have to equal PascalCase(dir).
3. **`entry.options` reach the constructor.** YAML `options:` merged and passed
   to the component constructor (config-loader.ts:783-789). Rendered value
   observed in HTML.
4. **Layout wiring works.** `layout: {position: "left", priority: 45,
   condition: "not-index"}` on the local entry: component rendered in the left
   sidebar on note+canvas pages, absent from `index.html`.
5. **Static resources ship.** `Component.afterDOMLoaded` landed in the page
   script chain; `Component.css` was compiled+minified into its own
   `component-<hash>.css` wrapped in `@layer quartz-base` and `<link>`ed from
   pages. NOTE: css is minified — comments stripped (assert on selectors, not
   comment markers).
6. **Plain-Node ESM constraint (gotcha G6) holds**: `import { h } from
   "preact"` resolves via the plugin's realpath → repo root `node_modules`
   (symlinks not preserved), same as canvas-plugin.

## Consequences for the plan

- `vintrin-explorer/` and `vintrin-breadcrumbs/` each declare ONE component in
  `quartz.components` and provide `components/index.js` — no build step, no
  exports map required.
- Config generator appends them as absolute-path sources with the layout
  blocks from plan §4.5 — mechanically identical to `canvasPluginDir`.
- No `ctx.trie` interaction anywhere in the component path (components only
  receive `QuartzComponentProps`).

## Spike artifacts

Throwaway (not source-controlled): `.tmp/spike-hello-component/`,
`.tmp/spike-run.mjs`. Reproduce: `node .tmp/spike-run.mjs` (Node >= 22).
