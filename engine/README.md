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
  strictLinks: false, // optional: broken internal links fail the build (default: report only)
})
// result.staging: what was staged/excluded + warnings
// result.validation: { leaks: LeakFinding[], brokenLinks: BrokenLinkReport }
//   - leaks is always [] on success: any leak throws PrivateContentLeakError
//   - brokenLinks: grouped by source page; render with formatBrokenLinkReport()
```

Everything exported from `src/index.ts` is public; everything else is an
implementation detail.

## Pipeline

1. **VaultStager** stages ONLY publishable files (per **PublishFilter**) into a
   fresh staging directory (default: under `os.tmpdir()`). Since id-based
   publishing (ADR 0003) staging is also the id-transformation surface:
   - Every publishable doc must carry a stable docid (md frontmatter `id:`,
     canvas `metadata.frontmatter.id`; grammar `docid_[0-9a-z]{21}_e` in
     `src/docId.ts`). Missing/malformed/duplicate ids throw
     `DocIdValidationError` (full offending list) BEFORE anything is written —
     fix with `make vault-add-ids VAULT=<vault>`.
   - Docs are staged *named by id*: `n/<docid>.md` / `n/<docid>.canvas`
     (root `index.md` stays at `index.md` so the site keeps `/`). Quartz stays
     id-unaware; its slugs — and therefore all URLs, graph/backlinks/search —
     follow from the staged names automatically.
   - `title: <original basename>` is injected when absent (md frontmatter /
     canvas metadata) so pages never display raw docids.
   - The RESERVED key `vintrinPath: <original vault-relative path>` is ALWAYS
     injected (md frontmatter / canvas metadata) — the folder-shaped
     explorer/breadcrumbs place docs by it (ADR 0004). A publishable vault doc
     declaring `vintrinPath` itself throws `ReservedFrontmatterKeyError`
     (all offenders listed) before anything is written.
   - Wikilinks in md bodies and canvas text cards are rewritten to docid
     targets (`src/wikilinkRewriter.ts`; display text and `#anchors`
     preserved, code spans skipped, unresolved links left as-is); canvas
     `file` nodes are remapped to staged paths. Resolution goes through the
     shared Quartz resolver (`src/stagingLinkIndex.ts`) — slugging is never
     reimplemented. Assets stage at their vault paths (no id carrier).
2. **QuartzConfigGenerator** turns the site settings into `quartz.config.yaml`
   ("config inversion": users never see Quartz config).
3. **QuartzRunner** runs the vendored, pinned Quartz CLI (see ADR 0002) against
   staging and writes the site to `outDir`.
4. **SiteValidator** (final stage, `src/validation/`) inspects the emitted
   output:
   - **Leak check** (`LeakChecker`) — the plan §4.4 backstop. Every excluded
     text file (md/canvas) is fingerprinted (whitespace-normalized content
     lines of >= 20 chars; canvas files fingerprint their AUTHORED strings, not
     JSON syntax) and every emitted text file (html/xml/json/js/css/txt) is
     scanned. Any hit throws `PrivateContentLeakError` naming the private file
     and the emitted file — the build FAILS. Limitation (accepted): this
     catches VERBATIM content; markdown-transformed lines may not match. The
     primary enforcement remains staging exclusion; this pass catches
     mechanism regressions.
   - **Broken-internal-link check** (`LinkChecker`) — verifies every internal
     `href`/`src`/`data-viewer-src` in emitted HTML, plus canvas payloads
     (attachments map, open-note hrefs, text-card links), against the output
     dir. Note fragments are rebased to their canvas page (their HTML is
     injected into that page's DOM). External URLs, `mailto:`, and same-page
     `#anchors` are skipped. Result is REPORTED in
     `BuildSiteResult.validation.brokenLinks`; pass `strictLinks: true`
     (CLI: `--strict-links`) to escalate findings to a build failure
     (`BrokenInternalLinksError`). Strictness is a build-invocation policy,
     deliberately NOT a site.json field (that schema grows reluctantly).

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
| 2 | under an `excludeFolders` entry | NOT published |
| 3 | markdown with frontmatter `publish: false` | NOT published |
| 4 | markdown with frontmatter `publish: true` | published |
| 5 | markdown under an `includeFolders` entry | published |
| 6 | any other markdown | NOT published (default deny) |
| 7 | canvas under an `includeFolders` entry | published |
| 8 | any other canvas | NOT published (default deny) |
| 9 | any other non-markdown asset (images, PDFs, ...) | published (default allow) |

Notes:
- `publish: false` always wins over `includeFolders` (rule 3 before rule 5).
- `excludeFolders` wins over everything, including `publish: true` — it is
  meant for machinery folders (`templates/`, ...), like Quartz's own
  `ignorePatterns`.
- Markdown with a frontmatter block that fails to parse is treated as NOT
  published (fail closed — it might contain an unreadable `publish: false`)
  and surfaces a build warning.
- **Canvases (Phase 2):** canvas JSON carries authored content but has no
  frontmatter, so folder rules are its only opt-in surface. Content-bearing
  files stay default-deny like markdown; dumb assets stay default-allow.
  Attachments referenced by canvases follow the normal asset rules — an asset
  referenced ONLY by private content is still published unless excluded.

## Privacy / degradation rule (decided Phase 1, per plan §4.4 and ADR 0001)

- **Rule:** when a canvas references a note excluded by the publish filter,
  the published canvas renders that card as a contentless, unlinked
  **"Private note" placeholder**. No title-derived content (the vault path is
  removed from the emitted JSON), no body, no link. (Full omission becomes a
  per-site option post-MVP, plan §7.10.)
- **Enforcement mechanism: staging exclusion.** Quartz and our canvas plugin
  only ever read the staging directory, which contains exclusively
  publishable files — private content is not reachable by the build, so it
  cannot leak by construction. A corollary: private and missing references
  are indistinguishable, so the placeholder is no existence oracle.
- **Backstop (built in Phase 3):** the validation pass (pipeline step 4 above)
  FAILS the build if content from any unpublished file appears in the emitted
  output (the fixture vault's `LEAK-SENTINEL-9f3a72` plus a seeded-leak
  integration test exercise both directions).
- **Known, deliberate degradation:** a MARKDOWN wikilink to an unpublished
  note (e.g. `[[private-secret]]`) emits a dead href — only canvas cards get
  placeholders. The broken-link report surfaces these to the site owner.

## Canvas publishing (Phase 2)

`.canvas` files under `includeFolders` are staged, and the generated config
registers `canvas-plugin/` (repo-local Quartz pageType+emitter plugin,
ADR 0001; the official `canvas-page` plugin stays disabled). Canvas pages get
backlinks/graph/search entries, and `[[x.canvas]]` wikilinks from markdown
resolve to real pages. `SiteBuilder` fails fast if canvases are staged but the
viewer bundle was never built (`npm run setup` / `npm run bundle:viewer`).
See `canvas-plugin/README.md`.

## Folder-shaped navigation (ADR 0004)

The UI shows the ORIGINAL vault hierarchy while URLs stay `/n/<docid>`: the
generated config disables stock `explorer`/`breadcrumbs`/`folder-page` and
registers our local component plugins `vintrin-explorer/` and
`vintrin-breadcrumbs/` (same local-source mechanism as `canvas-plugin/`).
Both derive placement from the staged `vintrinPath` key (pipeline step 1).
Folders are collapse-only — no folder URLs exist anywhere. See the plugin
READMEs and `docs/decisions/0004-folder-nav-local-component-plugins.md`.

## Stable vs evolving

- **Stable:** the sacred boundary; `buildSite()` shape; site.json schema
  (grows compatibly, never breaks); publish-filter precedence; the privacy
  rule; leaks-always-fail-the-build; the reserved `vintrinPath` key.
- **Evolving:** the generated Quartz plugin set; staging internals;
  `StagingResult` details; `ValidationResult` details (fingerprint heuristics,
  link-check coverage).

## Gotchas (hard-won, do not rediscover)

- Quartz's content glob honors `.gitignore` — a staging dir under a
  gitignored path of an enclosing repo makes Quartz silently see 0 files
  (verified empirically in Phase 1: `.build/` staging fails). Default staging
  under `os.tmpdir()` avoids this; `SiteBuilder` also fails loudly if Quartz
  reports 0 input files while markdown was staged.
- Quartz must run with cwd = its checkout root; the generated
  `quartz.config.yaml` is written into `vendor/quartz/` each build (by design).
- **One build at a time per checkout.** Concurrent builds against the same
  vendored Quartz race on `quartz.config.yaml` and `.quartz-cache/` (observed:
  a half-written esbuild bundle -> `TypeError: buildQuartz is not a function`).
  Integration tests run with `--test-concurrency=1` for this reason; the
  hosted service must give each build job its own checkout or serialize.
- Node >= 22 required (Quartz 5 is engine-strict).
