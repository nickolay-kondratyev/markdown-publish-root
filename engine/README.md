# Publish Engine

A pure build engine: `(Obsidian vault, site settings) -> static site directory`.

**The sacred boundary (plan/main.md §3):** no AWS, no auth, no tenant
awareness in this module — ever. It reads a directory and writes a directory.
The future hosted service is a thin wrapper invoking exactly this code.

## Public interface

```ts
import { SiteBuilder, SiteConfigParser } from "./src/index.ts"

const siteConfig = SiteConfigParser.parseFile("site.json") // validates, throws SiteConfigError
const result = await new SiteBuilder().buildSite({
  vaultDir: "/path/to/vault",
  siteConfig,
  outDir: "/path/to/public",
})
// result.staging: what was staged/excluded + warnings
```

Everything exported from `src/index.ts` is public; everything else is an
implementation detail.

## Pipeline

1. **VaultStager** copies ONLY publishable files (per **PublishFilter**) into a
   fresh staging directory (default: under `os.tmpdir()`).
2. **QuartzConfigGenerator** turns the site settings into `quartz.config.yaml`
   ("config inversion": users never see Quartz config).
3. **QuartzRunner** runs the vendored, pinned Quartz CLI (see ADR 0002) against
   staging and writes the site to `outDir`.

## site.json schema

```jsonc
{
  "title": "My Site",              // required
  "baseUrl": "notes.example.com",  // required; host (+ optional path), NO protocol, NO trailing slash
  "locale": "en-US",               // optional (default en-US)
  "theme": {                       // optional; unset values fall back to stock Quartz
    "typography": { "header": "...", "body": "...", "code": "..." },
    "colors": {
      "lightMode": { "secondary": "#284b63" },  // named Quartz colors only
      "darkMode":  { "secondary": "#7b97aa" }
    }
  },
  "publishFilter": {               // optional
    "includeFolders": ["blog"],    // vault-relative, "/"-separated, no leading/trailing slash
    "excludeFolders": ["templates"]
  }
}
```

Validation is strict at the boundary: unknown keys are rejected (typo
protection) and all problems are reported at once. This schema is
deliberately small — it is the customization surface we support forever;
grow it reluctantly.

## Publish filter semantics

First matching rule wins:

| # | Rule | Decision |
|---|------|----------|
| 1 | any path segment starts with `.` (e.g. `.obsidian/`) | NOT published |
| 2 | file is `.canvas` (**Phase 1 only**, see below) | NOT published |
| 3 | under an `excludeFolders` entry | NOT published |
| 4 | markdown with frontmatter `publish: false` | NOT published |
| 5 | markdown with frontmatter `publish: true` | published |
| 6 | markdown under an `includeFolders` entry | published |
| 7 | any other markdown | NOT published (default deny) |
| 8 | any other non-markdown asset (images, PDFs, ...) | published (default allow) |

Notes:
- `publish: false` always wins over `includeFolders` (rule 4 before rule 6).
- `excludeFolders` wins over everything, including `publish: true` — it is
  meant for machinery folders (`templates/`, ...), like Quartz's own
  `ignorePatterns`.
- Markdown with a frontmatter block that fails to parse is treated as NOT
  published (fail closed — it might contain an unreadable `publish: false`)
  and surfaces a build warning.

## Privacy / degradation rule (decided Phase 1, per plan §4.4 and ADR 0001)

- **Rule:** when a canvas references a note excluded by the publish filter,
  the published canvas renders that card as a contentless, unlinked
  **"Private note" placeholder**. No title-derived content, no body, no link.
  (Full omission becomes a per-site option post-MVP, plan §7.10.)
- **Enforcement mechanism: staging exclusion.** Quartz (and in Phase 2 our
  canvas plugin) only ever reads the staging directory, which contains
  exclusively publishable files — private content is not reachable by the
  build, so it cannot leak by construction.
- **Backstop (Phase 3):** a validation pass greps the emitted output and
  FAILS the build if content from any unpublished file appears (the fixture
  vault's `LEAK-SENTINEL-9f3a72` exercises this; the integration test already
  asserts it today).

## Phase 1 canvas exclusion

`.canvas` files are excluded from staging AND the official Quartz
`canvas-page` plugin is disabled in the generated config, so nothing claims
them. Wikilinks targeting canvases therefore stay unresolved in Phase 1.
Phase 2 replaces this with our own pageType plugin (ADR 0001).

## Stable vs evolving

- **Stable:** the sacred boundary; `buildSite()` shape; site.json schema
  (grows compatibly, never breaks); publish-filter precedence; the privacy rule.
- **Evolving:** the generated Quartz plugin set (Phase 2 adds our canvas
  plugin, drops the canvas exclusion); staging internals; `StagingResult` details.

## Gotchas (hard-won, do not rediscover)

- Quartz's content glob honors `.gitignore` — a staging dir under a
  gitignored path of an enclosing repo makes Quartz silently see 0 files
  (verified empirically in Phase 1: `.build/` staging fails). Default staging
  under `os.tmpdir()` avoids this; `SiteBuilder` also fails loudly if Quartz
  reports 0 input files while markdown was staged.
- Quartz must run with cwd = its checkout root; the generated
  `quartz.config.yaml` is written into `vendor/quartz/` each build (by design).
- Node >= 22 required (Quartz 5 is engine-strict).
