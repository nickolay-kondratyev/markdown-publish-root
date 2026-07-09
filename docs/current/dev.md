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
2. **Renderer isolation** (plan §4.3): exactly one module owns the hesprs viewer dependency — `canvas-plugin/viewer/canvasView.js`. Everything else emits JSON Canvas + URL maps, renderer-agnostic (React Flow escape hatch stays cheap).

## Modules

| Module | Role | README |
|---|---|---|
| `engine/` | `SiteBuilder.buildSite({vaultDir, siteConfig, outDir})`: VaultStager (publish filter → staging dir), QuartzConfigGenerator (config inversion), QuartzRunner (vendored pinned Quartz), SiteValidator (leak check fails build; broken-link report) | `engine/README.md` |
| `canvas-plugin/` | Quartz 5 pageType plugin: claims `.canvas`, registers links (graph/backlinks/search), rewrites canvas JSON at build time (markdown cards via shared resolver, subpath slicing, private placeholders, canvas→canvas cards), emits pages mounting the viewer | `canvas-plugin/README.md` |
| `cli/` | `publish build` / `publish preview` (pure PreviewPathResolver + node:http wiring; implements the URL-routing contract of `docs/hosting.md`) / `publish deploy` (pure DeployPlanner + executor, `--dry-run`) | `cli/README.md` |
| `test-vault/` | Canonical fixture; exercises the full parity checklist; private note carries leak sentinel `LEAK-SENTINEL-9f3a72` — do not break its invariants | `test-vault/README.md` |
| `vendor/quartz/` | Gitignored pinned Quartz checkout; pin in `vendor/quartz-pin.json`; managed by `npm run setup` (ADR 0002) | — |

## Key design points

- **One shared resolver:** vault path → URL is Quartz's (`transformLink`/`slugifyFilePath` from `@quartz-community/utils`). Never reimplement slugging.
- **Privacy by construction:** private files never reach staging, so the build can't leak them; the LeakChecker is a backstop that fails the build on verbatim matches. Private vs missing refs are deliberately indistinguishable ("Private note" placeholder).
- **Config inversion:** users provide small `site.json`; Quartz config is generated per build. Grow the schema reluctantly.
- **Node IDs + coordinates preserved** in emitted canvas JSON (future commenting anchors, plan §1).

## Dev workflow

```bash
source ~/.nvm/nvm.sh && nvm use 26        # Node >= 22 required
npm install && npm run setup              # idempotent Quartz bootstrap
npm run typecheck && npm test             # 220 unit + 34 integration (node:test, BDD GIVEN/WHEN/THEN)
npm run test:e2e                          # HTTP + headless Chromium smoke via the real preview server (36 checks)
```

Gotchas (hard-won, see `docs/status/phase-*.md`):
- Quartz's content glob honors `.gitignore` — never stage a vault under a gitignored dir (staging defaults to `os.tmpdir()`; SiteBuilder fails loudly on 0 files).
- Integration tests run builds SERIALLY — concurrent builds corrupt the shared vendored `.quartz-cache`.
- hesprs `attachments` mutates `node.file` in place; extension dispatch uses the original filename (the fragment-remap trick relies on this).
- Local shell profile is noisy — redirect verbose command output to `.tmp/` logs.

## Current state / what's next

MVP complete, DoD verified by browser QA (38/38): `plan/done/mvp-execution-summary.md`. Local preview: `publish preview` (URL-routing contract + CloudFront Function recipe: `docs/hosting.md`). Pending: real-vault dogfood, real AWS deploy (+ manual CloudFront Function per `docs/hosting.md`), follow-ups in plan §7 (incl. SSR canvas prerender, file-card "armed" affordance, link-card fallback).
