# `npm run typecheck` fails on canvas-plugin/test/unit/pageBody.test.ts (pre-existing)

Status: OPEN
Origin: noticed 2026-07-13 while implementing canvas link cards (typecheck was
already red on a clean tree — verified via `git stash` baseline).

`tsc --noEmit` reports TS2352 at `canvas-plugin/test/unit/pageBody.test.ts:5`:
the cast of `CanvasPageBody` (a preact component function taking
`{ fileData }`) to `((props: Record<string, unknown>) => unknown) & { css: string }`
"may be a mistake because neither type sufficiently overlaps".

Fix direction: adjust the test's cast (e.g. cast through `unknown`, or type the
helper to Quartz's actual body-component signature) — do NOT loosen tsconfig.

Impact: `npm run typecheck` exits 2, masking any NEW type errors elsewhere.
Unit/integration tests are unaffected (Node type stripping, not tsc).
