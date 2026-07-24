# IMPLEMENTATION REVIEW — notes URL prefix `/n/` -> `/notes/`

Branch: `notes-url-prefix` · Commit under review: `3ed5d11`
Reviewer: IMPLEMENTATION_REVIEWER (read-only on source)

## Verdict: APPROVE with one IMPORTANT doc fix

The code change is correct, complete, and minimal. `ID_NAMESPACE_DIR` is the
genuine single source of truth; every path (links, backlinks, graph, search,
canvas embeds, staging) derives from `IdMap.stagedPathOf`, so the one-line flip
`"n" -> "notes"` propagates automatically. Typecheck and the full test suite
pass locally (re-verified — see below). No BLOCKING issues. One IMPORTANT
current-tense doc miss (root `README.md`) and two MINOR items.

## Verification I re-ran (from repo root, this environment)
- `npm run typecheck` — exit 0. (`.tmp/tc.log`)
- `npm test` — exit 0: **592 unit + 87 integration, 0 fail** — matches the impl
  report's claimed counts exactly. (`.tmp/test.log`; `vendor/quartz` present so
  integration actually ran.)
- Code/test/script grep sweep for `"n/` `'n/` `` `n/ `` `n/${` `data-slug="n/`
  `n\/` `/n/` `"n/".length` across `engine/ canvas-plugin/ cli/ scripts/`:
  the ONLY hit is a false positive — `application\/json` inside a regex in
  `engine/test/integration/buildSiteCanvas.test.ts:395` (matches `n/` inside
  the word "json"). No real stale namespace literal remains in code.
- e2e (`npm run test:e2e`) NOT run (needs headless Chromium) — same gap the
  impl report honestly discloses.

## 🚨 BLOCKING
None.

## ⚠️ IMPORTANT
1. **Root `README.md` still advertises the OLD scheme (current-tense, user-facing).**
   - `README.md:28` — "stamp stable doc ids (page URLs are `/n/<docid>`, so they
     survive renames …)".
   - `README.md:60` — "Local preview (production URL routing, e.g. extensionless
     `/n/<docid>` pages)".
   These are present-tense statements of how the shipping product behaves, not
   historical narrative. The impl updated `engine/README.md`, `docs/*`, and
   `docs-internal/current/*`, but the **top-level onboarding README** — the first
   doc a user reads — was missed and now tells users the wrong URL. The impl
   report's "Docs (6)" list does not include it. Fix: `/n/<docid>` -> `/notes/<docid>`
   on both lines. Low effort, should land before merge for consistency with the
   rest of the doc pass.

## 💡 MINOR / Suggestions
2. **Fixture prose is stale:** `test-vault/notes/guides/deep-dive.md:10` — body
   text "the URL stays `/n/<docid>`". It is published content (not asserted by
   any test), so no functional impact, but it now documents the wrong scheme in
   the fixture vault. Cheap to correct while touching docs.

3. **Consideration (not a defect): the `notes` namespace dir now overlaps a very
   common vault folder name.** Assets are staged path-preserving
   (`vaultStager.ts:128-130 copyPreservingStructure`), so a vault asset at
   `notes/diagram.png` stages into the SAME `notes/` dir as id-named docs
   (`notes/<segment>.<ext>`). A real filename collision still requires an asset
   named exactly like a derived url-segment (`docid_…_e.*`, or a coincidental
   foreign-id segment) — effectively impossible for generated ids, negligible for
   foreign ids. This is the same latent pattern that existed under `n/`; it is
   merely more visible now because `notes/` is a name real vaults actually use.
   No action needed for this task; noted for awareness. The `index`/`_index`
   hijack guard (`UrlSegment.spoofsMarkerOrIndex`) is unchanged and still fully
   protects `notes/index` routing — verified.

## Item-by-item against the review checklist
1. **Completeness** — PASS. No stale `n/`-as-namespace literal in code/tests/
   scripts. Remaining `/n/` strings in `plan/`, `docs-internal/decisions/*`
   (ADR 0004/0005/0006), `docs-internal/status/folder-nav.md`, and
   `plan/assesments/*` are authored-time historical narrative — correctly left.
   `docs/publish-to-s3.md:89` (`prefix n` -> `/n/404.html`) documents the
   unrelated deploy-path `prefix` config, not the note namespace — correctly
   left. Genuine misses: `README.md` (IMPORTANT #1) + fixture prose (MINOR #2).
2. **Correctness/consistency** — PASS. `ID_NAMESPACE_DIR = "notes"`
   (`idMap.ts:27`) is the sole source; `stagedPathOf` (`idMap.ts:104`) is the
   only place it is consumed. The two live grammar regexes that hardcoded the
   prefix (`buildSite.test.ts` off-grammar filter; `folderNav.test.ts`
   `DOC_HREF_GRAMMAR`) and the `foreignIds.test.ts` `.slice("n/".length)` were
   all updated. No slice length or regex left expecting `n/`.
3. **Routing risk** — PASS. `index`/`_index` guard unchanged and still applies
   to `notes/index`; no new reserved-word collision introduced.
4. **DRY** — GOOD. The constant is exported from `engine/src/index.ts` and reused
   in every test/e2e that can import it; the harness re-exports it so
   assertion-only scripts get it for free. Deliberate, reasonable exceptions:
   `canvas-plugin` test literal (no engine import — avoids an unclean
   cross-package dep) and the two regex literals (escaped `\/` reads worse built
   from a constant). Sound calls.
5. **Tests** — PASS. Updated assertions genuinely assert the NEW behavior via
   `` `${ID_NAMESPACE_DIR}/…` `` and the corrected grammar regexes, not a blind
   find/replace. Coverage that a note/canvas id maps to `notes/<id>` is intact
   (`idMap.test.ts`, `vaultStager.test.ts`, `stagingTransforms.test.ts`, plus
   integration). No behavior-capturing test was removed or weakened.
6. **Report truthfulness** — PASS. typecheck exit 0 and 592+87/0-fail both
   independently reproduced; e2e-not-run and the "exploration-report-missed two
   regexes" note are candid and accurate.

## Readiness
Requirement is functionally met. Recommend fixing IMPORTANT #1 (root README) —
and ideally MINOR #2 — before merge so the primary user doc matches shipped
behavior. Everything else is clean. No BLOCKING issues; approve once the README
lines are corrected (or explicitly deferred by the human).
