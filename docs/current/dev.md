# Dev Documentation

High-level map for engineers/agents. Deep detail lives in each module's README; history in `docs/status/`, decisions in `docs/decisions/`, original plan in `plan/main.md`.

## Architecture

```
vault ──> engine (pure: stage -> generate Quartz config -> run Quartz -> validate) ──> static site dir
                                    │
                                    └─ canvas-plugin (Quartz pageType) renders .canvas pages
cli ──> thin boundary: `build` wraps the engine; `preview` (local server) and `deploy` (AWS) live ONLY here
```

Two inviolable rules:

1. **Sacred boundary** (plan §3): `engine/` never touches AWS/auth/tenancy. Deploy code is `cli/src/deploy/` only.
2. **Renderer isolation** (plan §4.3): exactly one module tree owns the viewer dependency — `canvas-plugin/viewer/` owning React Flow (`@xyflow/react`, ADR 0003; migrated from hesprs). Everything else emits JSON Canvas + URL maps, renderer-agnostic (the next renderer swap stays cheap).

## Modules

| Module | Role | README |
|---|---|---|
| `engine/` | `SiteBuilder.buildSite({vaultDir, siteConfig, outDir})`: VaultStager (publish filter → id validation → id-transformed staging dir), QuartzConfigGenerator (config inversion), QuartzRunner (vendored pinned Quartz), SiteValidator (leak check fails build; broken-link report) | `engine/README.md` |
| `canvas-plugin/` | Quartz 5 pageType plugin: claims `.canvas`, registers links (graph/backlinks/search), rewrites canvas JSON at build time (markdown cards via shared resolver, subpath slicing, private placeholders, canvas→canvas cards), emits pages mounting the viewer | `canvas-plugin/README.md` |
| `vintrin-explorer/` | Quartz 5 component plugin: folder-shaped Explorer over stable-id URLs — server-rendered from the engine-injected `vintrinPath`; collapse-only folders (ADR 0005) | `vintrin-explorer/README.md` |
| `vintrin-breadcrumbs/` | Quartz 5 component plugin: `Home ❯ folders (plain text) ❯ title` crumbs from `vintrinPath` (ADR 0005) | `vintrin-breadcrumbs/README.md` |
| `cli/` | `publish build` / `publish preview` (pure PreviewPathResolver + node:http wiring; implements the URL-routing contract of `docs/hosting.md`) / `publish deploy` (pure DeployPlanner + executor, `--dry-run`) | `cli/README.md` |
| `test-vault/` | Canonical fixture; exercises the full parity checklist; private note carries leak sentinel `LEAK-SENTINEL-9f3a72` — do not break its invariants | `test-vault/README.md` |
| `vendor/quartz/` | Gitignored pinned Quartz checkout; pin in `vendor/quartz-pin.json`; managed by `npm run setup` (ADR 0002) | — |

## Key design points

- **One shared resolver:** vault path → URL is Quartz's (`transformLink`/`slugifyFilePath` from `@quartz-community/utils`). Never reimplement slugging. Since id-based publishing (ADR 0004) the contract is `vaultPath → docid → URL`: staging resolves wikilinks with the SAME Quartz utils against the original path slugs, then maps path-slug → docid (`engine/src/stagingLinkIndex.ts`).
- **Stable-id URLs:** every doc page (note/canvas) is served at `/n/<docid>` (`/n/<docid>.canvas`), docid from frontmatter `id:` / canvas `metadata.frontmatter.id` (grammar `docid_[0-9a-z]{21}_e`, `engine/src/docId.ts`). Renames never change URLs. Missing/malformed/duplicate ids hard-fail the build BEFORE Quartz; stamp ids with `make vault-add-ids VAULT=<vault>`. Root `index.md` stays at `/`; assets stay path-based.
- **Folder-shaped UI over stable ids (ADR 0005):** staging injects the reserved `vintrinPath` key (ORIGINAL vault path) into every staged doc; local component plugins `vintrin-explorer`/`vintrin-breadcrumbs` render tree/crumbs from it (stock explorer/breadcrumbs/folder-page disabled — their slug tries flatten to `n/`). Folders are collapse-only: no folder URLs. A publishable vault doc declaring `vintrinPath` hard-fails the build.
- **Privacy by construction:** private files never reach staging, so the build can't leak them; the LeakChecker is a backstop that fails the build on verbatim matches. Private vs missing refs are deliberately indistinguishable ("Private note" placeholder).
- **Config inversion:** users provide small `site.json`; Quartz config is generated per build. Grow the schema reluctantly.
- **Node IDs + coordinates preserved** in emitted canvas JSON (future commenting anchors, plan §1).

## Dev workflow

```bash
source ~/.nvm/nvm.sh && nvm use 26        # Node >= 22 required
npm install && npm run setup              # idempotent Quartz bootstrap
npm run typecheck && npm test             # unit + integration (node:test, BDD GIVEN/WHEN/THEN)
npm run test:e2e                          # headless-Chromium e2e via the real preview server (smoke, canvas viewer, zen-mode, folder-nav)
```

Gotchas (hard-won, see `docs/status/phase-*.md`):
- Quartz's content glob honors `.gitignore` — never stage a vault under a gitignored dir (staging defaults to `os.tmpdir()`; SiteBuilder fails loudly on 0 files).
- Integration tests run builds SERIALLY — concurrent builds corrupt the shared vendored `.quartz-cache`.
- The note-card "fragment-remap trick": extension dispatch uses the ORIGINAL `.md` filename while the fetch uses the `attachments`-remapped fragment URL — keep both when touching the rewriter or `canvasToFlow.js`.
- Local shell profile is noisy — redirect verbose command output to `.tmp/` logs.

## Current state / what's next

MVP complete, DoD verified by browser QA (38/38): `plan/done/mvp-execution-summary.md`. Local preview: `publish preview` (URL-routing contract + CloudFront Function recipe: `docs/hosting.md`). Pending: real-vault dogfood, real AWS deploy (+ manual CloudFront Function per `docs/hosting.md`), follow-ups in plan §7 (incl. SSR canvas prerender, file-card "armed" affordance, link-card fallback).
