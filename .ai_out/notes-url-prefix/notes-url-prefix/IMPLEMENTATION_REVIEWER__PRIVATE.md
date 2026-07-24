# PRIVATE state — IMPLEMENTATION_REVIEWER, notes-url-prefix

## Status: REVIEW COMPLETE. Verdict = APPROVE with one IMPORTANT doc fix.

## What was reviewed
Commit `3ed5d11` on branch `notes-url-prefix`: flip `ID_NAMESPACE_DIR` `"n"`->
`"notes"` in `engine/src/idMap.ts:27`, export it from `engine/src/index.ts`,
update all tests/e2e/docs to match. Single source of truth = `IdMap.stagedPathOf`
(`idMap.ts:104`).

## Independently verified (this env, vendor/quartz present)
- `npm run typecheck` exit 0.
- `npm test` exit 0 = 592 unit + 87 integration, 0 fail (matches report).
- Code grep sweep clean; only false positive = `application\/json` regex in
  `buildSiteCanvas.test.ts:395`.

## Findings
- BLOCKING: none.
- IMPORTANT #1: root `README.md:28` and `README.md:60` still say `/n/<docid>`
  (current-tense user doc; missed by the impl's doc pass). Needs `/notes/`.
- MINOR #2: `test-vault/notes/guides/deep-dive.md:10` fixture prose says
  `/n/<docid>` (published content, not asserted).
- MINOR #3 (consideration): `notes` namespace dir now overlaps common vault
  folder name; assets stage path-preserving into same dir. Collision needs
  filename == derived-segment (near-impossible). `index` guard unchanged & valid.

## Correctly-left historical `/n/` (NOT misses)
ADRs 0004/0005/0006, `docs-internal/status/folder-nav.md`,
`plan/id-based-publishing.md`, `plan/folder-nav-over-id-urls.md`,
`plan/assesments/*`, and `docs/publish-to-s3.md:89` (`prefix n` = deploy-path
prefix, unrelated concept).

## If re-engaged
Confirm README lines fixed (or human-deferred), then full approve.
Outputs written: IMPLEMENTATION_REVIEW__PUBLIC.md (+ this file).
