# MVP Execution Summary (plan/main.md — DONE)

**Executed:** 2026-07-08 · **Final commit:** `3499df0` · **Verdict:** Definition of done MET (38/38 in-browser QA checks).

Source plan: [[plan/main.md]]. Per-phase detail: `docs/status/phase-{0..4}.md`. Decisions: `docs/decisions/`.

---

## What exists now

INPUT an Obsidian vault (markdown + `.canvas`) → OUTPUT a static site, via:

```bash
npm install && npm run setup                                  # one-time bootstrap (pins Quartz)
node cli/bin/publish.mjs build <vault> --config site.json --out ./public
node cli/bin/publish.mjs deploy ./public --deploy-config deploy.json [--dry-run]
```

| Module | Purpose |
|---|---|
| `engine/` | Pure build engine: `SiteBuilder.buildSite({vaultDir, siteConfig, outDir})`. Publish filter (staging-exclusion), generated Quartz config (config inversion), validation pass. Zero AWS/auth/tenancy — sacred boundary held. |
| `canvas-plugin/` | Our Quartz 5 pageType plugin: claims `.canvas`, registers slugs/titles/outbound links (canvases appear in graph, backlinks, search), emits canvas pages with build-time-rendered cards. `viewer/canvasView.js` is the ONE module owning the hesprs dependency (renderer isolation, React Flow escape hatch cheap). |
| `cli/` | `publish build` + `publish deploy` (S3 sync + CloudFront invalidation, 3-class cache headers, dry-run). |
| `test-vault/` | Fixture vault exercising the full parity checklist, incl. a `publish: false` note with leak sentinel `LEAK-SENTINEL-9f3a72`. |
| `vendor/quartz/` | Gitignored pinned Quartz checkout (commit in `vendor/quartz-pin.json`, managed by `npm run setup`). |

## Phase-by-phase

### Phase 0 — Spikes (commits `55716ab`, `2c146ca`)
- **Spike A (Quartz):** GO for plugin-shaped integration, no fork. Quartz 5 pageType plugin API proven hands-on (local plugin claimed a dummy extension, emitted HTML, registered links). Node >= 22 required; Quartz NOT on npm.
- **Spike B (hesprs):** viewer surface verified from source + headless smoke (21/21). Self-hosted bundle proven. Gaps found: subpath ignored, PDF unsupported, canvas→canvas blank — all mitigable by build-time canvas-JSON rewriting.
- **Spike C:** shared resolver recipe via `@quartz-community/utils` (`transformLink`, `slugifyFilePath`) — slugging never reimplemented.
- **Key deviation from plan:** Quartz 5 ships an official `canvas-page` plugin (plan assumed none). Decision (Nickolay-approved, ADR 0001): build our own pageType plugin + hesprs; disable the official one (it lacks embedded note cards, wikilinks, subpaths, media, link registration).

### Phase 1 — Engine skeleton (`460575d` → `97a52cf`)
Repo layout, pinned Quartz vendoring (ADR 0002), minimal `site.json` schema, publish filter (`publish: true` frontmatter OR include-folders; `publish: false` always wins; fails closed on malformed frontmatter), markdown-only build of test-vault e2e-verified over HTTP. Gotcha confirmed empirically: Quartz's content glob honors `.gitignore` → staging lives in `os.tmpdir()` with a loud 0-files guard.

### Phase 2 — Canvas integration (`85acee1` → `2ba01e5`)
Full parity checklist closed: build-time markdown cards (shared resolver), note cards with `#heading`/`#^block` subpath slicing (reuses Quartz's own transclude machinery), media cards, PDF fallback link cards, styled navigable canvas→canvas cards, sandboxed link cards, groups/edges/colors/minimap/pan/zoom, live theme wiring to Quartz's toggle, private references → contentless "Private note" placeholder (path stripped, node IDs/coords preserved for future commenting). `[[x.canvas]]` from markdown resolves; canvases in graph/backlinks/search.

### Phase 3 — Validation + deploy (`9d4ae4f` → `4afde47`)
- **Leak check (fails build):** fingerprints of every filtered-out file scanned across all emitted text output; proven by a negative integration test (seeded leak → `PrivateContentLeakError`).
- **Broken-link report** (HTML + canvas payloads), `--strict-links` to escalate.
- **Deploy:** pure `DeployPlanner` (unit-testable command plan) + executor; no real AWS run in sandbox (no credentials) — dry-run e2e proven.

### Phase 4 — QA / dogfood (`29a69bd`, `3499df0`)
Playwright agent walked the definition of done in real Chromium, desktop + mobile: all 38 checks PASS, zero console errors, sentinel absent from entire output, private URL 404s. Report: `docs/status/phase-4-qa-report.md`.

## Testing in place

- **181 unit** + **34 integration** (real fixture builds, incl. negative leak test) + **28 e2e checks** (curl + headless Chromium) + **38 browser QA checks**. All green under `source ~/.nvm/nvm.sh && nvm use 26`:
  `npm run typecheck && npm test && npm run test:e2e`
- Every phase's suite was independently re-run by the orchestrator before the phase was accepted.

## Known caveats / next steps

1. **Real-vault dogfood pending** — the fixture stood in; run against Nickolay's actual vault.
2. **No real deploy executed** (sandbox had no AWS credentials); CloudFront needs a manual extensionless→`.html` Function (see `docs/status/phase-3.md`).
3. **Accepted cosmetic gaps:** edge `toEnd:none`/`fromEnd`, group background images.
4. **Follow-ups** recorded in plan/main.md §7 (items 11-13 added by QA: canvas search preview via SSR, file-card "armed" affordance, link-card fallback face).

## Execution notes (how it was run)

Orchestrator + sub-agents: 2 parallel spike agents (Phase 0), 3 sequential implementation agents (Phases 1-3, sequential to avoid same-file conflicts), 1 Playwright QA agent (Phase 4, test-only). Renderer decision escalated to Nickolay per plan §8 and approved before Phase 1.
