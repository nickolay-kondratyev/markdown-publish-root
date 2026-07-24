# PRIVATE state — notes URL prefix task

## Status: COMPLETE. All code/tests/docs changed. typecheck + npm test green.
Awaiting top-level commit. e2e NOT run (no browser).

## The change in one line
`engine/src/idMap.ts` `ID_NAMESPACE_DIR` `"n"` -> `"notes"` is the ONLY logic
change. Everything else is literal/comment/doc alignment to match, plus a new
public export of the constant to enable DRY reuse.

## Key architecture facts (for rehydration)
- `IdMap.stagedPathOf` (`idMap.ts:97-105`) is the single source of truth:
  returns `${ID_NAMESPACE_DIR}/${urlSegment}${ext}`. Root index.md/index.canvas
  excepted (stay at `/`). Quartz slugs the staged tree location -> URL. No
  component re-implements the prefix.
- `ID_NAMESPACE_DIR` is now exported from `engine/src/index.ts` (added to the
  `./idMap.ts` export line alongside `DocIdValidationError`).

## DRY pattern used
- Tests that import from `../../src/idMap.ts` (or engine index): added
  `ID_NAMESPACE_DIR` to imports, used `` `${ID_NAMESPACE_DIR}/…` `` in slug consts.
- E2E `.mjs` scripts: harness `scripts/lib/e2eHarness.mjs` imports the constant
  from engine index and re-exports it; scripts import it from the harness. Except
  `e2e-foldernav.mjs` (standalone) imports directly from `../engine/src/index.ts`.
- EXCEPTIONS hardcoded `notes/` (constant not used, deliberately):
  - `canvas-plugin/test/unit/canvasVirtualPage.test.ts` `CANVAS_FILE` — no
    engine import in canvas-plugin; cross-package dep would be unclean.
  - Regex literals `^notes\/docid…` in `buildSite.test.ts:59` and
    `folderNav.test.ts DOC_HREF_GRAMMAR` — regex escaping reads worse w/ constant.

## GOTCHAS (things the exploration report MISSED — re-check if reverting/redoing)
1. `engine/test/integration/buildSite.test.ts:59` grammar regex `^n\/docid…`
   -> `^notes\/docid…`. Caused the only test failure on first run.
2. `engine/test/integration/folderNav.test.ts:21` `DOC_HREF_GRAMMAR` regex
   `/^\/n\/docid…/` -> `/^\/notes\/docid…/`; and line 94 `path.join(OUT_DIR,"n",
   "index.html")` -> `path.join(OUT_DIR, ID_NAMESPACE_DIR, "index.html")`.
3. Extra files not in report list: `cli/test/integration/buildDiscovery.test.ts`,
   `scripts/e2e-link-cards.mjs`, `scripts/e2e-search.mjs`, `scripts/e2e-smoke.mjs`.
4. `foreignIds.test.ts:63` `.slice("n/".length)` -> `.slice(ID_NAMESPACE_DIR.length + 1)`.

## Verification commands (all from repo root)
- `mkdir -p .tmp; npm run typecheck > .tmp/typecheck.log 2>&1` — exit 0.
- `npm test > .tmp/test.log 2>&1` — exit 0; 592 unit + 87 integration pass.
  (`vendor/quartz/` already present, so integration ran — no `npm run setup`.)
- Stray-literal sweep (must be empty):
  `grep -rnE '`n/|"n/|'\''n/|/n/' --include="*.ts" --include="*.mjs" --include="*.js" engine canvas-plugin cli scripts | grep -v node_modules | grep -v vendor/quartz`

## Remaining / not done
- e2e (`npm run test:e2e`) not executed — needs headless Chromium. Scripts were
  updated but are UNVERIFIED by me. If a browser becomes available, run it.
- No git commit (owned by top-level agent).
- Intentionally left historical: ADRs, status/folder-nav.md, completed plan docs
  (`plan/id-based-publishing.md`, `plan/folder-nav-over-id-urls.md`,
  `plan/assesments/*`), and `docs/publish-to-s3.md:89` `prefix n` deploy example
  (unrelated concept).
