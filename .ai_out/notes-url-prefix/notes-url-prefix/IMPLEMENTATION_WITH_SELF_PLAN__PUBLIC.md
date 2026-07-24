# IMPLEMENTATION: notes URL prefix `/n/` -> `/notes/`

## Goal
Change the published URL namespace for note/canvas pages from `/n/<id>` to
`/notes/<id>`. Example: foreign id `nmfpvvpg1eq081o06s1g18x` now publishes at
`https://www.glassthought.com/notes/nmfpvvpg1eq081o06s1g18x`.

## Plan (executed)
1. Flip the single source-of-truth constant `ID_NAMESPACE_DIR` `"n"` -> `"notes"`.
2. Export it from the engine public API so consumers/tests reuse it (DRY).
3. Update every test/e2e literal that hardcoded the `n/` prefix, preferring the
   imported constant over re-hardcoding `"notes"`.
4. Update stale `/n/` doc comments and user-facing / current docs.
5. Verify: typecheck + full unit+integration suites; grep for stray literals.

No config knob was added (Pareto: human asked only for `/notes/`, a clean
constant flip; a selectable prefix would be over-engineering — see Callouts).

## Files changed

### Engine source (7)
- `engine/src/idMap.ts` — `ID_NAMESPACE_DIR = "notes"` (was `"n"`); doc comment.
- `engine/src/index.ts` — now re-exports `ID_NAMESPACE_DIR` (new public API, enables DRY reuse in tests/scripts).
- `engine/src/urlSegment.ts` — 2 doc-comment `/n/` -> `/notes/`.
- `engine/src/quartzConfigGenerator.ts` — 4 doc/inline comments `/n/`,`n/` -> notes.
- `engine/src/docId.ts` — 1 doc comment `/n/<docid>` -> `/notes/<docid>`.
- `engine/src/canvasStagingTransform.ts` — 1 doc comment `n/<docid>.*` -> `notes/<docid>.*`.
- `engine/src/vaultStager.ts` — 1 doc comment `n/<docid>.*` -> `notes/<docid>.*`.

(No downstream logic changes needed: `vaultStager`, `canvasStagingTransform`,
`stagingLinkIndex` all derive paths from `IdMap.stagedPathOf`, which uses the
constant. Wikilinks/backlinks/graph/search follow automatically.)

### Unit tests (5) — all reuse imported `ID_NAMESPACE_DIR` except cross-package one
- `engine/test/unit/idMap.test.ts` — import + 4 assertions + 3 test-name strings.
- `engine/test/unit/vaultStager.test.ts` — import + 8 path literals + 2 test names.
- `engine/test/unit/stagingTransforms.test.ts` — import + 1 assertion.
- `engine/test/unit/urlSegment.test.ts` — 1 test-name string (`/n/` -> `/notes/`).
- `canvas-plugin/test/unit/canvasVirtualPage.test.ts` — `CANVAS_FILE` literal
  `n/…` -> `notes/…` (hardcoded, NOT the constant: canvas-plugin has no engine
  import; a cross-package dependency there would be unclean).

### Integration tests (6) — reuse imported `ID_NAMESPACE_DIR`
- `engine/test/integration/buildSite.test.ts` — import; 5 SLUG consts; comment;
  **grammar regex** `^n\/docid…` -> `^notes\/docid…` (this was NOT in the
  exploration report — caught by the failing test run).
- `engine/test/integration/buildSiteCanvas.test.ts` — import + 5 SLUG consts.
- `engine/test/integration/folderNav.test.ts` — import; 2 SLUG consts; header
  comment; **`DOC_HREF_GRAMMAR` regex** `^\/n\/…` -> `^\/notes\/…` (also NOT in
  exploration report); `no /n/ folder-listing` assertion now `path.join(OUT_DIR,
  ID_NAMESPACE_DIR, "index.html")` + test name.
- `engine/test/integration/foreignIds.test.ts` — import; 2 SLUG consts; comment;
  `.slice("n/".length)` -> `.slice(ID_NAMESPACE_DIR.length + 1)`.
- `engine/test/integration/renameStability.test.ts` — import + 1 slug const.
- `cli/test/integration/buildDiscovery.test.ts` — import from `../../../engine/src/index.ts` + 4 SLUG consts.

### E2E scripts (8)
- `scripts/lib/e2eHarness.mjs` — imports `ID_NAMESPACE_DIR` from engine index and
  re-exports it, so the assertion-only scripts get it for free (single home).
- `scripts/e2e-canvas-flow.mjs`, `e2e-link-cards.mjs`, `e2e-mode-switcher.mjs`,
  `e2e-screen-mode.mjs`, `e2e-search.mjs`, `e2e-smoke.mjs` — import the constant
  from the harness; every `n/…` slug / `/n/` URL literal now uses it.
- `scripts/e2e-foldernav.mjs` — standalone (own `docIdOf`); imports
  `ID_NAMESPACE_DIR` directly from `../engine/src/index.ts`; 3 slug consts + 2
  comment strings.

### Docs (6, factual/current statements only)
- `engine/README.md` (2), `docs/config-format.md` (1), `docs/publish-to-s3.md`
  (1: `/n/X.canvas` -> `/notes/X.canvas`), `docs-internal/current/dev.md` (2),
  `docs-internal/current/usage.md` (2), `plan/main.md` (1 deviation-note line).

## Verification
- `npm run typecheck` — PASS (exit 0). Log: `.tmp/typecheck.log`.
- `npm test` (unit + integration; `vendor/quartz` was already present so
  integration ran) — PASS: **592 unit + 87 integration tests, 0 failures**.
  Log: `.tmp/test.log`. First run caught 1 failure (the buildSite grammar regex
  I had missed); fixed, re-ran fully green.
- Grep sweep: NO remaining `n/`-namespace prefix literals or grammar regexes in
  `engine/ canvas-plugin/ cli/ scripts/` code/tests. Verified.
- `npm run test:e2e` — NOT run (needs headless Chromium / browser; out of scope
  per instructions). The 8 e2e scripts were updated consistently but NOT
  executed in this environment. CALLOUT: they are unverified by me.

## Callouts / decisions
1. **No config knob (Pareto).** Clean constant flip as instructed; no backward-
   compat shim, no `/n/`+`/notes/` selector. Old `/n/<id>` URLs will 404 after
   redeploy — no redirects added (not requested).
2. **Exploration report gaps (found via failing test, not the report):** two
   live grammar regexes hardcoded the prefix —
   `buildSite.test.ts:59` and `folderNav.test.ts:21 DOC_HREF_GRAMMAR` — plus the
   `folderNav` `no /n/ folder-listing` `path.join(..,"n",..)` assertion, and the
   extra files `cli/test/integration/buildDiscovery.test.ts`,
   `scripts/e2e-link-cards.mjs`, `scripts/e2e-search.mjs`, `scripts/e2e-smoke.mjs`.
   All handled.
3. **Regex literals kept as literals** (`^notes\/docid…`) rather than built from
   the constant: `new RegExp` with escaped separators reads worse than a literal.
   DRY of the constant applied only where it reads cleanly (template strings).
4. **Left as historical narrative** (per task's judiciousness guidance): ADRs
   under `docs-internal/decisions/`, `docs-internal/status/folder-nav.md`, and
   the completed/assessment plan docs (`plan/id-based-publishing.md`,
   `plan/folder-nav-over-id-urls.md`, `plan/assesments/…`). They describe the
   scheme as of authoring time. `docs/publish-to-s3.md:89` `prefix n` example
   left as-is: it documents the unrelated deploy-path `prefix` config, not the
   note namespace.

## Not done (intentional)
- No git commit (top-level agent commits).
- No e2e execution (environment/browser).
